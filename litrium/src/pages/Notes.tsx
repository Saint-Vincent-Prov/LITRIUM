import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { addReminder, deleteNote, deleteReminder, listNotes, listReminders, saveNote, setReminderDone } from "../data/api";
import type { Note } from "../data/types";
import { useAsync, useDataVersion } from "../lib/useAsync";
import { fmtWhen } from "../lib/when";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Overlay";
import { Button, EmptyState, ErrorState, IconButton, Segmented, Skeleton, TextInput, Tile } from "../ui/primitives";
import { useToast } from "../ui/Toast";

type View = "notes" | "rappels";

export default function Notes() {
  const [params, setParams] = useSearchParams();
  const view = (params.get("vue") as View) || "notes";
  const setView = (v: View) => setParams(v === "notes" ? {} : { vue: v }, { replace: true });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{view === "notes" ? "Notes" : "Rappels"}</h1>
          <p>{view === "notes" ? "Tout ce que vous ne voulez pas oublier." : "Les choses à faire, avec une alerte au bon moment."}</p>
        </div>
        <div className="page-head__actions">
          <Segmented<View>
            label="Affichage"
            value={view}
            onChange={setView}
            options={[
              { value: "notes", label: "Notes" },
              { value: "rappels", label: "Rappels" },
            ]}
          />
        </div>
      </div>
      {view === "notes" ? <NotesView /> : <RemindersView />}
    </>
  );
}

function NotesView() {
  const notes = useAsync(listNotes);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Note | "new" | null>(null);

  // deep link from home: /notes?note=id
  useEffect(() => {
    const id = params.get("note");
    if (id && notes.data) {
      const n = notes.data.find((x) => x.id === id);
      if (n) setEditing(n);
      setParams({}, { replace: true });
    }
  }, [params, notes.data, setParams]);

  const list = (notes.data ?? []).filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <div className="toolbar" style={{ marginBottom: "var(--s-4)" }}>
        <TextInput label="Rechercher dans les notes" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="ink" icon="plus" onClick={() => setEditing("new")}>
          Nouvelle note
        </Button>
      </div>
      {notes.status === "error" && !notes.data ? (
        <Tile>
          <ErrorState error={notes.error} onRetry={notes.reload} />
        </Tile>
      ) : !notes.data ? (
        <div className="notes-grid">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h="9rem" r="var(--r-xl)" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Tile>
          {q ? (
            <EmptyState icon="search" title="Aucune note trouvée">Essayez un autre mot.</EmptyState>
          ) : (
            <EmptyState icon="note" title="Aucune note" action={<Button variant="ink" onClick={() => setEditing("new")}>Écrire une note</Button>} />
          )}
        </Tile>
      ) : (
        <ul className="notes-grid">
          {list.map((n) => (
            <li key={n.id}>
              <button className="tile notecard" onClick={() => setEditing(n)}>
                <span className="notecard__title">
                  {n.pinned && (
                    <span className="notecard__pin" title="Épinglée">
                      <Icon name="pin" />
                      <span className="sr-only">Épinglée : </span>
                    </span>
                  )}
                  {n.title || "Sans titre"}
                </span>
                <span className="notecard__body">{n.body}</span>
                <span className="notecard__date">Modifiée {fmtWhen(n.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <NoteModal note={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function NoteModal({ note, onClose }: { note: Note | null; onClose: () => void }) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { bump } = useDataVersion();
  const toast = useToast();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveNote({ id: note?.id, title: title.trim(), body, pinned });
      bump();
      toast(note ? "Note enregistrée." : "Note créée.");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!note) return;
    await deleteNote(note.id);
    bump();
    toast("Note supprimée.");
    onClose();
  };

  return (
    <Modal
      title={note ? "Modifier la note" : "Nouvelle note"}
      onClose={onClose}
      footer={
        <>
          {note && (
            <Button variant="danger" icon="trash" onClick={remove} className="mr-auto">
              Supprimer
            </Button>
          )}
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="ink" type="submit" form="note-form" loading={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="note-form" className="stack" onSubmit={submit} noValidate>
        {error && <p className="form-error">{error}</p>}
        <TextInput label="Titre" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="field">
          <label className="field__label" htmlFor="note-body">
            Contenu
          </label>
          <textarea id="note-body" className="input note-body" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div>
          <Button type="button" size="sm" variant={pinned ? "ink" : "soft"} icon="pin" aria-pressed={pinned} onClick={() => setPinned((p) => !p)}>
            {pinned ? "Épinglée" : "Épingler"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RemindersView() {
  const rs = useAsync(listReminders);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { bump } = useDataVersion();
  const toast = useToast();
  const now = new Date().toISOString();

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return setError("Écrivez le rappel.");
    setBusy(true);
    try {
      await addReminder(text, due ? new Date(due).toISOString() : undefined);
      setText("");
      setDue("");
      setError("");
      bump();
      toast("Rappel ajouté.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string, done: boolean) => {
    await setReminderDone(id, done);
    bump();
  };
  const remove = async (id: string) => {
    await deleteReminder(id);
    bump();
  };

  const open = (rs.data ?? []).filter((r) => !r.done);
  const done = (rs.data ?? []).filter((r) => r.done);

  return (
    <div className="grid-main-side">
      <Tile labelledBy="rem-list">
        <h2 id="rem-list" className="section-head__title">
          À faire {rs.data && <span className="muted">({open.length})</span>}
        </h2>
        {rs.status === "error" && !rs.data ? (
          <ErrorState error={rs.error} onRetry={rs.reload} />
        ) : !rs.data ? (
          <Skeleton h="8rem" />
        ) : rs.data.length === 0 ? (
          <EmptyState icon="check" title="Aucun rappel">Ajoutez-en un, ou demandez à l'assistant.</EmptyState>
        ) : (
          <>
            {open.length === 0 && <p className="muted">Tout est fait 🎉</p>}
            <ul className="checklist checklist--full">
              {open.map((r) => (
                <li key={r.id}>
                  <input type="checkbox" id={`r-${r.id}`} checked={false} onChange={() => toggle(r.id, true)} />
                  <label htmlFor={`r-${r.id}`}>
                    <span>{r.text}</span>
                    {r.due && (
                      <span className={`checklist__due ${r.due < now ? "is-late" : ""}`}>
                        <Icon name="clock" /> {r.due < now ? "En retard · " : ""}
                        {fmtWhen(r.due)}
                      </span>
                    )}
                  </label>
                  <IconButton icon="trash" label={`Supprimer « ${r.text} »`} onClick={() => remove(r.id)} />
                </li>
              ))}
            </ul>
            {done.length > 0 && (
              <details className="done-list">
                <summary>Terminés ({done.length})</summary>
                <ul className="checklist checklist--full">
                  {done.map((r) => (
                    <li key={r.id} className="is-done">
                      <input type="checkbox" id={`r-${r.id}`} checked onChange={() => toggle(r.id, false)} />
                      <label htmlFor={`r-${r.id}`}>
                        <span>{r.text}</span>
                      </label>
                      <IconButton icon="trash" label={`Supprimer « ${r.text} »`} onClick={() => remove(r.id)} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Tile>
      <Tile labelledBy="rem-add">
        <h2 id="rem-add" className="section-head__title">
          Nouveau rappel
        </h2>
        <form className="stack" onSubmit={add} noValidate>
          <TextInput label="À faire" placeholder="Ex. Prendre rendez-vous chez le coiffeur" value={text} onChange={(e) => setText(e.target.value)} error={error} />
          <TextInput label="Quand (facultatif)" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} hint="Une alerte s'affiche à l'heure dite si Litrium est ouvert." />
          <Button variant="ink" type="submit" loading={busy}>
            Ajouter
          </Button>
        </form>
      </Tile>
    </div>
  );
}
