import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { MODE, deleteAccount, getAccount, getUser, resetDemo, signOut, updateUser } from "../data/api";
import { aiServerAvailable } from "../lib/assistant";
import type { TempUnit, User } from "../data/types";
import { useAsync, useDataVersion } from "../lib/useAsync";
import { Modal } from "../ui/Overlay";
import { Button, ErrorState, SectionHead, Segmented, Skeleton, TextInput, Tile, Toggle } from "../ui/primitives";
import { useToast } from "../ui/Toast";

export default function Settings() {
  const user = useAsync(getUser);
  const account = useAsync(getAccount);
  const server = useAsync(aiServerAvailable);
  const navigate = useNavigate();
  const [form, setForm] = useState<User | null>(null);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { bump } = useDataVersion();
  const toast = useToast();

  useEffect(() => {
    if (user.data && !form) setForm(user.data);
  }, [user.data, form]);

  const set = <K extends keyof User>(k: K, v: User[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const persist = async (patch: Partial<User>, message: string) => {
    try {
      await updateUser(patch);
      bump();
      toast(message);
    } catch (err) {
      toast((err as Error).message, "negative");
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = "Le nom est obligatoire.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = "Adresse e-mail invalide.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    await persist(MODE === "remote" ? { name: form.name.trim() } : { name: form.name.trim(), email: form.email.trim() }, "Réglages enregistrés.");
    setBusy(false);
  };

  const setNotifications = async (on: boolean) => {
    if (on && "Notification" in window && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") {
        toast("Le navigateur a refusé les notifications.", "negative");
        return;
      }
    }
    set("notifications", on);
    persist({ notifications: on }, on ? "Notifications activées." : "Notifications désactivées.");
  };

  const doReset = async () => {
    try {
      await resetDemo();
      sessionStorage.removeItem("litrium-assistant-history");
      setForm(null);
      bump();
      toast(MODE === "remote" ? "Vos données ont été effacées." : "Données de démonstration réinitialisées.");
      setConfirmReset(false);
    } catch (err) {
      toast((err as Error).message, "negative");
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Réglages</h1>
          <p>Votre profil, l'assistant et les notifications.</p>
        </div>
      </div>
      {user.status === "error" && !user.data ? (
        <Tile>
          <ErrorState error={user.error} onRetry={user.reload} />
        </Tile>
      ) : !form ? (
        <Skeleton h="24rem" r="var(--r-xl)" />
      ) : (
        <div className="grid-main-side">
          <form className="stack" onSubmit={save} noValidate>
            <Tile labelledBy="set-profile">
              <SectionHead id="set-profile" title="Profil" />
              <div className="grid-2">
                <TextInput label="Nom complet" autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
                <TextInput
                  label="E-mail"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  error={errors.email}
                  readOnly={MODE === "remote"}
                  hint={MODE === "remote" ? "Adresse de connexion. Vos amis vous ajoutent avec elle." : "Vos amis vous ajoutent avec cette adresse."}
                />
              </div>
            </Tile>
            <Tile labelledBy="set-ai">
              <SectionHead id="set-ai" title="Assistant IA" />
              {server.data === undefined ? (
                <Skeleton h="2rem" />
              ) : server.data ? (
                <p className="notice">✓ L'IA est active : l'assistant répond à toutes vos questions.</p>
              ) : (
                <p className="notice notice--warn">
                  {MODE === "remote"
                    ? "L'IA n'est pas encore activée sur ce site : l'assistant gère vos rappels, alarmes, agenda, notes et messages, mais pas les questions libres."
                    : "Ajoutez GEMINI_API_KEY dans le fichier .env puis relancez l'application pour activer les questions libres."}
                </p>
              )}
            </Tile>
            <div>
              <Button variant="ink" type="submit" loading={busy}>
                Enregistrer
              </Button>
            </div>
          </form>
          <div className="stack">
            <Tile labelledBy="set-account">
              <SectionHead id="set-account" title="Compte" />
              <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                {account.data
                  ? `Connecté avec ${account.data.provider === "google" ? "Google" : account.data.provider === "apple" ? "Apple" : "une adresse e-mail"} · créé le ${new Date(account.data.createdAt).toLocaleDateString("fr-FR")}`
                  : "…"}
              </p>
              <div>
                <Button
                  type="button"
                  icon="logout"
                  onClick={async () => {
                    await signOut();
                    navigate("/connexion", { replace: true });
                  }}
                >
                  Se déconnecter
                </Button>
              </div>
            </Tile>
            <Tile labelledBy="set-units">
              <SectionHead id="set-units" title="Météo" />
              <Segmented<TempUnit>
                label="Unité de température"
                value={form.unit}
                onChange={(v) => {
                  set("unit", v);
                  persist({ unit: v }, v === "C" ? "Températures en degrés Celsius." : "Températures en degrés Fahrenheit.");
                }}
                options={[
                  { value: "C", label: "°C" },
                  { value: "F", label: "°F" },
                ]}
              />
            </Tile>
            <Tile labelledBy="set-notif">
              <SectionHead id="set-notif" title="Notifications" />
              <Toggle
                checked={form.notifications}
                onChange={setNotifications}
                label="Notifications du navigateur"
                description="Pour les alarmes et rappels, même quand l'onglet est en arrière-plan."
              />
            </Tile>
            <Tile labelledBy="set-demo">
              <SectionHead id="set-demo" title={MODE === "remote" ? "Mes données" : "Données de démonstration"} />
              <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                {MODE === "remote"
                  ? "Effacez votre agenda, vos alarmes, notes, rappels et villes. Vos amis et messages sont conservés."
                  : "Remet amis, messages, agenda, alarmes et notes de ce compte dans leur état initial."}
              </p>
              <div className="row-gap">
                <Button variant="danger" type="button" onClick={() => setConfirmReset(true)}>
                  {MODE === "remote" ? "Effacer mes données" : "Réinitialiser"}
                </Button>
                <Button variant="danger" type="button" icon="trash" onClick={() => setConfirmDelete(true)}>
                  Supprimer mon compte
                </Button>
              </div>
            </Tile>
          </div>
        </div>
      )}
      {confirmDelete && (
        <Modal
          title="Supprimer votre compte ?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(false)}>Annuler</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await deleteAccount();
                    navigate("/bienvenue", { replace: true });
                  } catch (err) {
                    toast((err as Error).message, "negative");
                  }
                }}
              >
                Supprimer définitivement
              </Button>
            </>
          }
        >
          <p>Votre compte, votre agenda, vos alarmes, notes, rappels, amis et messages seront supprimés. C'est irréversible.</p>
        </Modal>
      )}
      {confirmReset && (
        <Modal
          title={MODE === "remote" ? "Effacer vos données ?" : "Réinitialiser la démo ?"}
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <Button onClick={() => setConfirmReset(false)}>Annuler</Button>
              <Button variant="danger" onClick={doReset}>
                {MODE === "remote" ? "Oui, effacer" : "Oui, réinitialiser"}
              </Button>
            </>
          }
        >
          <p>{MODE === "remote" ? "Votre agenda, vos alarmes, notes, rappels et villes seront effacés. C'est irréversible." : "Tout ce que vous avez créé pendant la démo sera effacé."}</p>
        </Modal>
      )}
    </>
  );
}
