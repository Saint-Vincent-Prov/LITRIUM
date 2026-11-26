import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { aiAvailable, respond, SUGGESTIONS, type ChatTurn } from "../lib/assistant";
import { useAsync } from "../lib/useAsync";
import { useDataVersion } from "../lib/useAsync";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/primitives";

const KEY = "litrium-assistant-history";

export const QUESTIONS = ["Explique-moi les trous noirs simplement", "Une idée de recette rapide pour ce soir ?"];

function loadHistory(): ChatTurn[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as ChatTurn[];
  } catch {
    return [];
  }
}

export default function Assistant() {
  const [turns, setTurns] = useState<ChatTurn[]>(loadHistory);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [params, setParams] = useSearchParams();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { bump } = useDataVersion();
  const handled = useRef<string | null>(null);
  const ai = useAsync(aiAvailable);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-40)));
    } catch {
      /* ignore */
    }
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, thinking]);

  const send = async (raw: string) => {
    const msg = raw.trim();
    if (!msg || thinking) return;
    const next: ChatTurn[] = [...turns, { role: "user", text: msg }];
    setTurns(next);
    setText("");
    setThinking(true);
    try {
      const reply = await respond(next);
      setTurns((t) => [...t, reply]);
      bump();
    } catch (e) {
      setTurns((t) => [...t, { role: "assistant", text: `Oups, quelque chose s'est mal passé : ${(e as Error).message}` }]);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  };

  // question coming from the top bar or the home screen
  useEffect(() => {
    const q = params.get("q");
    if (q && handled.current !== q) {
      handled.current = q;
      setParams({}, { replace: true });
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  return (
    <div className="assistant">
      <div className="page-head">
        <div>
          <h1>Assistant</h1>
          <p>Posez-lui n'importe quelle question, ou demandez-lui de noter, rappeler, réveiller, planifier.</p>
        </div>
        <div className="page-head__actions">
          {ai.data !== undefined &&
            (ai.data ? (
              <span className="status-chip status-chip--on">
                <span aria-hidden="true" className="status-chip__dot" /> IA connectée
              </span>
            ) : (
              <Link to="/parametres" className="status-chip">
                <span aria-hidden="true" className="status-chip__dot" /> IA non configurée
              </Link>
            ))}
          {turns.length > 0 && (
            <Button size="sm" onClick={() => setTurns([])}>
              Nouvelle conversation
            </Button>
          )}
        </div>
      </div>

      <section className="tile chat" aria-label="Conversation avec l'assistant">
        <div className="chat__log" role="log" aria-live="polite">
          {turns.length === 0 && (
            <div className="chat__empty">
              <span className="chat__orb" aria-hidden="true">
                <Icon name="sparkle" />
              </span>
              <p className="state__title">Comment puis-je vous aider ?</p>
              <div className="chips chips--center">
                {[...QUESTIONS, ...SUGGESTIONS.slice(0, 5)].map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`bubble bubble--${t.role}`}>
              <p className="bubble__text">{t.text}</p>
              {t.links && (
                <div className="bubble__links">
                  {t.links.map((l) => (
                    <Link key={l.to + l.label} to={l.to} className="btn btn--ghost btn--sm">
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div className="bubble bubble--assistant" aria-label="L'assistant réfléchit">
              <span className="dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form className="chat__input" onSubmit={onSubmit}>
          <label htmlFor="assistant-input" className="sr-only">
            Votre message
          </label>
          <textarea
            id="assistant-input"
            ref={inputRef}
            className="input"
            rows={1}
            placeholder="Écrivez votre demande…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            autoFocus
          />
          <Button variant="ink" type="submit" icon="paperPlane" disabled={!text.trim() || thinking} aria-label="Envoyer" />
        </form>
      </section>
    </div>
  );
}
