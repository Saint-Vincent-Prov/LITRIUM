import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { MODE, addFriendByEmail, getThread, listFriends, removeFriend, respondToRequest, sendMessage, type Conversation } from "../data/api";
import { useAsync, useDataVersion } from "../lib/useAsync";
import { initials } from "../app/Layout";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Overlay";
import { Badge, Button, EmptyState, ErrorState, IconButton, Skeleton, TextInput, Tile } from "../ui/primitives";
import { useToast } from "../ui/Toast";

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function Messages() {
  const { friendId } = useParams();
  const friends = useAsync(listFriends);
  const requests = (friends.data ?? []).filter((f) => f.status === "pending_in");
  const convs = (friends.data ?? []).filter((f) => f.status !== "pending_in");

  return (
    <>
      <div className={`page-head ${friendId ? "hide-mobile" : ""}`}>
        <div>
          <h1>Messages</h1>
          <p>Ajoutez vos amis avec leur adresse e-mail et discutez.</p>
        </div>
      </div>
      <div className={`messenger ${friendId ? "has-thread" : ""}`}>
        <div className="messenger__side stack">
          <AddFriend />
          {requests.length > 0 && <Requests list={requests} />}
          <Tile labelledBy="conv-title">
            <h2 id="conv-title" className="section-head__title">
              Conversations
            </h2>
            {friends.status === "error" && !friends.data ? (
              <ErrorState error={friends.error} onRetry={friends.reload} />
            ) : !friends.data ? (
              <div className="stack-sm">
                <Skeleton h="3.5rem" />
                <Skeleton h="3.5rem" />
              </div>
            ) : convs.length === 0 ? (
              <EmptyState icon="users" title="Pas encore d'amis">Ajoutez quelqu'un avec son adresse e-mail.</EmptyState>
            ) : (
              <ul className="convlist">
                {convs.map((f) => (
                  <li key={f.id}>
                    <ConvRow f={f} />
                  </li>
                ))}
              </ul>
            )}
          </Tile>
        </div>
        <div className="messenger__main">
          <Outlet />
        </div>
      </div>
    </>
  );
}

function ConvRow({ f }: { f: Conversation }) {
  const pending = f.status === "pending_out";
  return (
    <NavLink to={`/messages/${f.id}`} className="conv">
      <span className={`avatar avatar--sm ${pending ? "avatar--ghost" : ""}`} aria-hidden="true">
        {initials(f.name)}
      </span>
      <span className="conv__main">
        <span className="conv__name truncate">{f.name}</span>
        <span className="conv__last truncate">
          {pending ? "Invitation envoyée" : f.last ? `${f.last.from === "me" ? "Vous : " : ""}${f.last.text}` : "Dites bonjour 👋"}
        </span>
      </span>
      <span className="conv__meta">
        {f.last && <span className="muted conv__time">{when(f.last.at)}</span>}
        {f.unread > 0 && (
          <Badge tone="positive">
            {f.unread}
            <span className="sr-only"> non lu{f.unread > 1 ? "s" : ""}</span>
          </Badge>
        )}
      </span>
    </NavLink>
  );
}

function AddFriend() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { bump } = useDataVersion();
  const toast = useToast();
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await addFriendByEmail(email);
      bump();
      setEmail("");
      if (r.outcome === "invited") toast(`${r.email} n'a pas encore de compte : invitation enregistrée.`);
      else if (r.outcome === "requested") toast(`Demande envoyée à ${r.name}. Vous pourrez discuter dès qu'elle l'aura acceptée.`);
      else {
        toast(`${r.name} est maintenant votre ami·e.`);
        navigate(`/messages/${r.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tile labelledBy="add-title">
      <h2 id="add-title" className="section-head__title">
        Ajouter un ami
      </h2>
      <form className="inline-form" onSubmit={submit} noValidate>
        <TextInput label="Adresse e-mail" type="email" placeholder="prenom.nom@exemple.fr" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
        <Button variant="ink" type="submit" icon="userPlus" loading={busy}>
          Ajouter
        </Button>
      </form>
      <p className="field__hint">
        {MODE === "local" ? "Démo : essayez tom.lefevre@exemple.fr ou sarah.nguyen@exemple.fr." : "La personne reçoit une demande d'ami à accepter dans Litrium."}
      </p>
    </Tile>
  );
}

function Requests({ list }: { list: Conversation[] }) {
  const { bump } = useDataVersion();
  const toast = useToast();
  const answer = async (id: string, name: string, accept: boolean) => {
    try {
      await respondToRequest(id, accept);
      bump();
      toast(accept ? `${name} a été ajouté·e à vos amis.` : "Demande refusée.");
    } catch (e) {
      toast((e as Error).message, "negative");
    }
  };
  return (
    <Tile labelledBy="req-title">
      <h2 id="req-title" className="section-head__title">
        Demandes d'amis <Badge tone="positive">{list.length}</Badge>
      </h2>
      <ul className="convlist">
        {list.map((f) => (
          <li key={f.id} className="request">
            <span className="avatar avatar--sm" aria-hidden="true">
              {initials(f.name)}
            </span>
            <span className="conv__main">
              <span className="conv__name truncate">{f.name}</span>
              <span className="conv__last truncate">{f.email}</span>
            </span>
            <Button size="sm" variant="ink" onClick={() => answer(f.id, f.name, true)}>
              Accepter
            </Button>
            <IconButton icon="close" label={`Refuser la demande de ${f.name}`} onClick={() => answer(f.id, f.name, false)} />
          </li>
        ))}
      </ul>
    </Tile>
  );
}

export function ThreadPlaceholder() {
  return (
    <Tile className="thread thread--empty">
      <EmptyState icon="chat" title="Choisissez une conversation">Ou ajoutez un ami pour commencer à discuter.</EmptyState>
    </Tile>
  );
}

export function Thread() {
  const { friendId = "" } = useParams();
  const thread = useAsync(() => getThread(friendId), [friendId]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { bump } = useDataVersion();
  const toast = useToast();
  const navigate = useNavigate();
  const count = thread.data?.messages.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count, friendId]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      await sendMessage(friendId, text);
      setText("");
      bump();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    await removeFriend(friendId);
    bump();
    toast("Ami retiré.");
    navigate("/messages");
  };

  if (thread.status === "error" && !thread.data) {
    return (
      <Tile className="thread">
        <ErrorState error={thread.error} onRetry={(thread.error as { code?: string }).code === "not_found" ? undefined : thread.reload} />
        <Link to="/messages" className="btn btn--ghost btn--sm" style={{ alignSelf: "center" }}>
          Retour aux conversations
        </Link>
      </Tile>
    );
  }
  if (!thread.data) {
    return (
      <Tile className="thread">
        <Skeleton h="2.5rem" w="40%" />
        <Skeleton h="16rem" />
      </Tile>
    );
  }

  const { friend, messages } = thread.data;
  const canWrite = friend.status === "friend";

  return (
    <section className="tile thread" aria-labelledby="thread-title">
      <header className="thread__head">
        <Link to="/messages" className="icon-btn show-mobile" aria-label="Retour aux conversations">
          <Icon name="arrowLeft" />
        </Link>
        <span className="avatar avatar--sm" aria-hidden="true">
          {initials(friend.name)}
        </span>
        <div className="conv__main">
          <h2 id="thread-title" className="conv__name truncate">
            {friend.name}
          </h2>
          <p className="conv__last truncate">{friend.email}</p>
        </div>
        <IconButton icon="trash" label={`Retirer ${friend.name} de vos amis`} onClick={() => setConfirmRemove(true)} />
      </header>
      <div className="thread__log" role="log" aria-live="polite" aria-label={`Messages avec ${friend.name}`}>
        {!canWrite ? (
          <EmptyState icon="clock" title="Invitation en attente">
            {friend.email} n'a pas encore accepté. Vous pourrez discuter dès que ce sera fait.
          </EmptyState>
        ) : messages.length === 0 ? (
          <EmptyState icon="chat" title={`Dites bonjour à ${friend.name.split(" ")[0]} 👋`} />
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
            return (
              <div key={m.id} className="msg-wrap">
                {newDay && (
                  <p className="thread__day">{new Date(m.at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
                )}
                <div className={`bubble bubble--${m.from === "me" ? "user" : "assistant"}`}>
                  <p className="bubble__text">{m.text}</p>
                  <span className="bubble__time">
                    <span className="sr-only">{m.from === "me" ? "Vous, " : `${friend.name}, `}</span>
                    {new Date(m.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      {canWrite && (
        <form className="chat__input" onSubmit={send}>
          <label htmlFor="msg-input" className="sr-only">
            Message à {friend.name}
          </label>
          <textarea
            id="msg-input"
            className="input"
            rows={1}
            maxLength={2000}
            placeholder={`Message à ${friend.name.split(" ")[0]}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            aria-describedby={error ? "msg-error" : undefined}
            autoFocus
          />
          <Button variant="ink" type="submit" icon="paperPlane" loading={sending} disabled={!text.trim()} aria-label="Envoyer" />
        </form>
      )}
      {error && (
        <p id="msg-error" className="field__error" role="alert">
          {error}
        </p>
      )}
      {confirmRemove && (
        <Modal
          title={`Retirer ${friend.name} ?`}
          onClose={() => setConfirmRemove(false)}
          footer={
            <>
              <Button onClick={() => setConfirmRemove(false)}>Annuler</Button>
              <Button variant="danger" onClick={remove}>
                Retirer
              </Button>
            </>
          }
        >
          <p>La conversation sera supprimée de votre côté.</p>
        </Modal>
      )}
    </section>
  );
}
