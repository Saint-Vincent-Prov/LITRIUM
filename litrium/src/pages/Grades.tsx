import { useMemo, useState, type FormEvent } from "react";
import { addGrade, clearGrades, getAccessToken, importGrades, listGrades, listSubjects, removeGrade, setSubjectCoef, updateGrade } from "../data/api";
import type { Grade, GradeImport } from "../data/types";
import { computeAverages, fmtGrade, gradeTone, neededGrade, on20, parseNumber, periodsOf, round2, type SubjectAverage } from "../lib/grades";
import { notify } from "../lib/notifications";
import { useAsync, useDataVersion } from "../lib/useAsync";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Overlay";
import { Badge, Button, EmptyState, ErrorState, SelectInput, Skeleton, TextInput, Tile, Toggle } from "../ui/primitives";
import { useToast } from "../ui/Toast";

const ALL = "__all__";
const today = () => new Date().toISOString().slice(0, 10);

export default function Grades() {
  const grades = useAsync(listGrades);
  const subjects = useAsync(listSubjects);
  const [period, setPeriod] = useState<string | null>(null);
  const [withVirtual, setWithVirtual] = useState(true);
  const [editing, setEditing] = useState<Partial<Grade> | null>(null);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { bump } = useDataVersion();
  const toast = useToast();

  const list = grades.data ?? [];
  const periods = periodsOf(list);
  const current = period === ALL ? null : (period ?? periods[periods.length - 1] ?? null);
  const avg = useMemo(() => computeAverages(list, subjects.data ?? [], current, withVirtual), [list, subjects.data, current, withVirtual]);
  const virtualCount = list.filter((g) => g.virtual && (current == null || g.period === current)).length;

  const removeVirtuals = async () => {
    try {
      await clearGrades("virtual");
      bump();
      toast("Notes virtuelles effacées.");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Moyennes</h1>
          <p>Vos notes, vos moyennes, et des notes virtuelles pour simuler.</p>
        </div>
        <div className="page-head__actions">
          <Button variant="soft" icon="link" onClick={() => setImporting(true)}>
            École Directe
          </Button>
          <Button variant="ink" icon="plus" onClick={() => setEditing({ period: current ?? periods[periods.length - 1] ?? "Trimestre 1", virtual: false })}>
            Ajouter une note
          </Button>
        </div>
      </div>

      {grades.status === "error" ? (
        <Tile as="div">
          <ErrorState error={grades.error} onRetry={grades.reload} />
        </Tile>
      ) : grades.status === "loading" ? (
        <div className="grades-layout">
          <Tile as="div">
            <Skeleton h="9rem" />
          </Tile>
          <Tile as="div">
            <Skeleton h="16rem" />
          </Tile>
        </div>
      ) : list.length === 0 ? (
        <Tile as="div">
          <EmptyState
            icon="grad"
            title="Aucune note pour l'instant"
            action={
              <div className="row-gap">
                <Button variant="ink" icon="link" onClick={() => setImporting(true)}>
                  Importer depuis École Directe
                </Button>
                <Button variant="soft" icon="plus" onClick={() => setEditing({ period: "Trimestre 1", virtual: false })}>
                  Ajouter à la main
                </Button>
              </div>
            }
          >
            Importez toutes vos notes d'un coup depuis École Directe, ou ajoutez-les une par une.
          </EmptyState>
        </Tile>
      ) : (
        <div className="grades-layout">
          <Tile labelledBy="g-general" className="grades-summary">
            <h2 id="g-general" className="sr-only">
              Moyenne générale
            </h2>
            {periods.length > 1 && (
              <div className="grades-periods">
                <SelectInput label="Période" value={current ?? ALL} onChange={(e) => setPeriod(e.target.value)}>
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      {p || "Sans période"}
                    </option>
                  ))}
                  <option value={ALL}>Toute l'année</option>
                </SelectInput>
              </div>
            )}
            <p className="muted grades-summary__label">Moyenne générale{current ? ` · ${current}` : ""}</p>
            <p className={`grades-summary__avg num ${gradeTone(avg.general)}`} aria-live="polite">
              {fmtGrade(avg.general)}
              <small>/20</small>
            </p>
            {withVirtual && virtualCount > 0 && avg.realGeneral != null && avg.general != null && round2(avg.realGeneral) !== round2(avg.general) && (
              <p className="grades-summary__real">
                Sans les notes virtuelles : <strong className="num">{fmtGrade(avg.realGeneral)}</strong>{" "}
                <Delta value={avg.general - avg.realGeneral} />
              </p>
            )}
            <div className="grades-summary__controls">
              <Toggle
                checked={withVirtual}
                onChange={setWithVirtual}
                label="Compter les notes virtuelles"
                description={virtualCount ? `${virtualCount} note${virtualCount > 1 ? "s" : ""} virtuelle${virtualCount > 1 ? "s" : ""} sur cette période.` : "Ajoutez une note virtuelle pour voir l'effet sur vos moyennes."}
              />
              {list.some((g) => g.virtual) && (
                <Button variant="ghost" size="sm" icon="trash" onClick={removeVirtuals}>
                  Effacer les notes virtuelles
                </Button>
              )}
            </div>
          </Tile>

          <Tile labelledBy="g-subjects" className="grades-subjects">
            <h2 id="g-subjects" className="section-head__title">
              Par matière
            </h2>
            {avg.rows.length === 0 ? (
              <p className="muted">Aucune note sur cette période.</p>
            ) : (
              <ul className="subjects">
                {avg.rows.map((r) => (
                  <SubjectRow
                    key={r.name}
                    row={r}
                    open={open === r.name}
                    onToggle={() => setOpen(open === r.name ? null : r.name)}
                    onEdit={(g) => setEditing(g)}
                    onAddVirtual={() => setEditing({ subject: r.name, period: current ?? periods[periods.length - 1] ?? "", virtual: true })}
                    withVirtual={withVirtual}
                  />
                ))}
              </ul>
            )}
          </Tile>
        </div>
      )}

      {editing && (
        <GradeEditor
          initial={editing}
          subjects={[...new Set([...(subjects.data ?? []).map((s) => s.name), ...list.map((g) => g.subject)])].sort((a, b) => a.localeCompare(b, "fr"))}
          periods={periods}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            bump();
          }}
        />
      )}
      {importing && (
        <EcoleDirecteImport
          onClose={() => setImporting(false)}
          onDone={(added, updated) => {
            setImporting(false);
            bump();
            toast(added ? `${added} nouvelle${added > 1 ? "s" : ""} note${added > 1 ? "s" : ""} importée${added > 1 ? "s" : ""}.` : updated ? "Vos notes sont à jour." : "Aucune note trouvée sur École Directe.");
            if (added) notify({ kind: "grades", title: `${added} nouvelle${added > 1 ? "s" : ""} note${added > 1 ? "s" : ""}`, body: "Importées depuis École Directe", link: "/moyennes" }, undefined, { browser: false });
          }}
        />
      )}
    </>
  );
}

function Delta({ value }: { value: number }) {
  if (Math.abs(value) < 0.005) return null;
  return (
    <span className={`delta ${value > 0 ? "is-up" : "is-down"}`}>
      {value > 0 ? "+" : "−"}
      {fmtGrade(Math.abs(value))}
    </span>
  );
}

function SubjectRow({
  row,
  open,
  onToggle,
  onEdit,
  onAddVirtual,
  withVirtual,
}: {
  row: SubjectAverage;
  open: boolean;
  onToggle: () => void;
  onEdit: (g: Grade) => void;
  onAddVirtual: () => void;
  withVirtual: boolean;
}) {
  const { bump } = useDataVersion();
  const toast = useToast();
  const [target, setTarget] = useState("");
  const [targetCoef, setTargetCoef] = useState("1");
  const [coef, setCoef] = useState(String(row.coef));
  const t = parseNumber(target);
  const c = parseNumber(targetCoef);
  const needed = t != null && c != null ? neededGrade(row.sum, row.weight, t, c) : null;
  const panelId = `subj-${row.name.replace(/\W+/g, "-")}`;

  const saveCoef = async () => {
    const v = parseNumber(coef);
    if (v == null || v < 0 || v > 100) {
      setCoef(String(row.coef));
      return;
    }
    if (v === row.coef) return;
    try {
      await setSubjectCoef(row.name, v);
      bump();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <li className={`subject ${open ? "is-open" : ""}`}>
      <button className="subject__head" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="subject__name">
          {row.name}
          <span className="muted subject__meta">
            coef {fmtGrade(row.coef)} · {row.grades.length} note{row.grades.length > 1 ? "s" : ""}
            {row.classAverage != null && <> · classe {fmtGrade(row.classAverage)}</>}
          </span>
        </span>
        <span className="subject__avg">
          <span className={`num ${gradeTone(row.average)}`}>{fmtGrade(row.average)}</span>
          {withVirtual && row.realAverage != null && row.average != null && <Delta value={row.average - row.realAverage} />}
        </span>
        <Icon name="chevronDown" />
      </button>
      <div className="subject__bar" aria-hidden="true">
        <span className={gradeTone(row.average)} style={{ width: `${Math.max(0, Math.min(100, ((row.average ?? 0) / 20) * 100))}%` }} />
      </div>
      {open && (
        <div className="subject__panel" id={panelId}>
          <ul className="grade-chips">
            {row.grades.map((g) => (
              <li key={g.id}>
                <button className={`grade-chip ${g.virtual ? "is-virtual" : ""} ${g.excluded ? "is-excluded" : ""}`} onClick={() => onEdit(g)} title={g.title || undefined}>
                  <span className={`num grade-chip__value ${gradeTone(on20(g))}`}>
                    {fmtGrade(g.value)}
                    {g.outOf !== 20 && <small>/{fmtGrade(g.outOf)}</small>}
                  </span>
                  <span className="grade-chip__meta">
                    {g.title || (g.virtual ? "Note virtuelle" : "Note")}
                    <span className="muted">
                      {" "}
                      · coef {fmtGrade(g.coef)} · {new Date(g.date + "T12:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                  {g.virtual && <Badge tone="accent">virtuelle</Badge>}
                  {g.excluded && <Badge>non comptée</Badge>}
                </button>
              </li>
            ))}
          </ul>
          <div className="subject__tools">
            <Button size="sm" variant="soft" icon="plus" onClick={onAddVirtual}>
              Note virtuelle
            </Button>
            <label className="subject__coef">
              Coefficient de la matière
              <input className="input input--sm num" inputMode="decimal" value={coef} onChange={(e) => setCoef(e.target.value)} onBlur={saveCoef} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            </label>
          </div>
          <div className="needed">
            <p className="needed__title">Quelle note me faut-il ?</p>
            <div className="needed__row">
              <label>
                Moyenne visée
                <input className="input input--sm num" inputMode="decimal" placeholder="ex. 14" value={target} onChange={(e) => setTarget(e.target.value)} />
              </label>
              <label>
                Coef du prochain devoir
                <input className="input input--sm num" inputMode="decimal" value={targetCoef} onChange={(e) => setTargetCoef(e.target.value)} />
              </label>
            </div>
            {needed != null && (
              <p className="needed__answer" aria-live="polite">
                {needed > 20 ? (
                  <>Même un 20/20 ne suffira pas sur un seul devoir (il faudrait {fmtGrade(needed, 1)}).</>
                ) : needed <= 0 ? (
                  <>C'est déjà acquis : même un 0/20 vous laisse au-dessus de {fmtGrade(t)}.</>
                ) : (
                  <>
                    Il vous faut au moins <strong className="num">{fmtGrade(Math.ceil(needed * 4) / 4)}/20</strong> au prochain devoir.
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function GradeEditor({
  initial,
  subjects,
  periods,
  onClose,
  onSaved,
}: {
  initial: Partial<Grade>;
  subjects: string[];
  periods: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = !initial.id;
  const [f, setF] = useState({
    subject: initial.subject ?? "",
    title: initial.title ?? "",
    value: initial.value != null ? String(initial.value).replace(".", ",") : "",
    outOf: String(initial.outOf ?? 20),
    coef: String(initial.coef ?? 1).replace(".", ","),
    date: initial.date ?? today(),
    period: initial.period ?? "",
    virtual: initial.virtual ?? false,
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const imported = initial.source === "ecoledirecte";
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = parseNumber(f.value);
    const outOf = parseNumber(f.outOf);
    const coef = parseNumber(f.coef);
    const errors: Record<string, string> = {};
    if (!f.subject.trim()) errors.subject = "Indiquez la matière.";
    if (outOf == null || outOf <= 0) errors.outOf = "Le barème doit être plus grand que 0.";
    if (value == null || value < 0) errors.value = "Entrez une note (ex. 14,5).";
    else if (outOf != null && value > outOf) errors.value = `La note ne peut pas dépasser ${fmtGrade(outOf)}.`;
    if (coef == null || coef < 0 || coef > 100) errors.coef = "Coefficient entre 0 et 100.";
    setErr(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const data = {
        subject: f.subject.trim(),
        title: f.title.trim(),
        value: value!,
        outOf: outOf!,
        coef: coef!,
        date: f.date || today(),
        period: f.period.trim(),
        virtual: f.virtual,
      };
      if (isNew) await addGrade({ ...data, source: "manual" });
      else await updateGrade(initial.id!, imported ? { coef: data.coef } : data);
      onSaved();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await removeGrade(initial.id!);
      onSaved();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <Modal
      title={isNew ? (f.virtual ? "Ajouter une note virtuelle" : "Ajouter une note") : imported ? "Note École Directe" : "Modifier la note"}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" icon="trash" onClick={remove} className="mr-auto">
              Supprimer
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="ink" type="submit" form="grade-form" loading={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="grade-form" className="form-grid" onSubmit={submit} noValidate>
        {imported && <p className="muted form-grid__full">Cette note vient d'École Directe : seul son coefficient peut être modifié ici.</p>}
        <div className="form-grid__full">
          <TextInput label="Matière" list="subjects-list" value={f.subject} onChange={set("subject")} error={err.subject} disabled={imported} autoFocus={isNew && !f.subject} required />
          <datalist id="subjects-list">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <TextInput label="Note" inputMode="decimal" value={f.value} onChange={set("value")} error={err.value} disabled={imported} autoFocus={isNew && !!f.subject} placeholder="14,5" />
        <TextInput label="Sur" inputMode="decimal" value={f.outOf} onChange={set("outOf")} error={err.outOf} disabled={imported} />
        <TextInput label="Coefficient" inputMode="decimal" value={f.coef} onChange={set("coef")} error={err.coef} />
        <TextInput label="Date" type="date" value={f.date} onChange={set("date")} disabled={imported} />
        <div className="form-grid__full">
          <TextInput label="Intitulé (facultatif)" value={f.title} onChange={set("title")} disabled={imported} placeholder="Contrôle chapitre 3" />
        </div>
        <div className="form-grid__full">
          <TextInput label="Période" list="periods-list" value={f.period} onChange={set("period")} disabled={imported} placeholder="Trimestre 1" />
          <datalist id="periods-list">
            {periods.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        {!imported && (
          <div className="form-grid__full">
            <Toggle checked={f.virtual} onChange={(v) => setF({ ...f, virtual: v })} label="Note virtuelle" description="Pour simuler : elle ne compte que si les notes virtuelles sont affichées." />
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ---------- École Directe ---------- */

interface EdStudent {
  id: number;
  name: string;
  grades: GradeImport["grades"];
  subjects: GradeImport["subjects"];
}
type EdReply = { status: "ok"; students: EdStudent[] } | { status: "question"; question: string; choices: { label: string; value: string }[]; session: string };

async function edCall(body: Record<string, unknown>): Promise<EdReply> {
  const token = await getAccessToken();
  let r: Response;
  try {
    r = await fetch("/api/ecoledirecte", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Pas de connexion. Vérifiez votre accès à Internet.");
  }
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) throw new Error(data?.message ?? "Le service d'import ne répond pas. Réessayez plus tard.");
  return data as EdReply;
}

function EcoleDirecteImport({ onClose, onDone }: { onClose: () => void; onDone: (added: number, updated: number) => void }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState<Extract<EdReply, { status: "question" }> | null>(null);
  const [choice, setChoice] = useState("");
  const [students, setStudents] = useState<EdStudent[] | null>(null);

  const save = async (st: EdStudent) => {
    setBusy(true);
    try {
      const r = await importGrades({ grades: st.grades, subjects: st.subjects });
      setPw(""); // forget the password as soon as it's no longer needed
      onDone(r.added, r.updated);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const handle = async (reply: EdReply) => {
    if (reply.status === "question") {
      setQuestion(reply);
      setChoice("");
      setBusy(false);
      return;
    }
    setQuestion(null);
    setPw("");
    if (reply.students.length === 1) return save(reply.students[0]);
    setStudents(reply.students);
    setBusy(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (question) {
      if (!choice) return setError("Choisissez une réponse.");
      setBusy(true);
      try {
        await handle(await edCall({ step: "answer", identifiant: id, motdepasse: pw, session: question.session, choice }));
      } catch (err) {
        setQuestion(null);
        setError((err as Error).message);
        setBusy(false);
      }
      return;
    }
    if (!id.trim() || !pw) return setError("Entrez votre identifiant et votre mot de passe.");
    setBusy(true);
    try {
      await handle(await edCall({ step: "login", identifiant: id.trim(), motdepasse: pw }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Importer depuis École Directe"
      onClose={onClose}
      footer={
        !students && (
          <>
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="ink" type="submit" form="ed-form" loading={busy}>
              {question ? "Valider" : "Importer mes notes"}
            </Button>
          </>
        )
      }
    >
      {students ? (
        <div className="ed-students">
          <p>Ce compte a plusieurs élèves. Lesquelles importer ?</p>
          {students.map((s) => (
            <Button key={s.id} variant="soft" onClick={() => save(s)} disabled={busy}>
              {s.name} · {s.grades.length} notes
            </Button>
          ))}
        </div>
      ) : (
        <form id="ed-form" className="stack" onSubmit={submit} noValidate>
          {question ? (
            <fieldset className="ed-question">
              <legend>{question.question}</legend>
              <p className="muted">École Directe pose cette question pour vérifier que c'est bien vous.</p>
              <div className="ed-choices">
                {question.choices.map((c) => (
                  <label key={c.value} className={`ed-choice ${choice === c.value ? "is-on" : ""}`}>
                    <input type="radio" name="ed-choice" value={c.value} checked={choice === c.value} onChange={() => setChoice(c.value)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <>
              <p className="muted">
                Vos identifiants servent uniquement à récupérer vos notes, puis sont oubliés : Litrium ne les enregistre jamais. Vos notes ajoutées à la main et vos notes virtuelles sont conservées.
              </p>
              <TextInput label="Identifiant École Directe" autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} autoFocus />
              <TextInput label="Mot de passe" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              <Icon name="alert" /> {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}


