import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, MODE, getSession, signIn, signInWithProvider, signUp, startOAuth } from "../data/api";
import type { AuthProvider } from "../data/types";
import { useAsync, useDataVersion } from "../lib/useAsync";
import { googleReady, mountGoogleButton, type ProviderProfile } from "../lib/oauth";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Overlay";
import { Button, TextInput } from "../ui/primitives";
import { useToast } from "../ui/Toast";

type Mode = "signup" | "login";
type Social = Exclude<AuthProvider, "email">;
const LABEL: Record<Social, string> = { google: "Google", apple: "Apple" };
/** Online, the Google button shows once Google is switched on in Supabase (VITE_GOOGLE_ENABLED=true). */
const GOOGLE_ONLINE = MODE === "remote" && import.meta.env.VITE_GOOGLE_ENABLED === "true";
const SHOW_GOOGLE = MODE === "local" || GOOGLE_ONLINE;

export default function Auth({ mode }: { mode: Mode }) {
  const session = useAsync(getSession);
  const navigate = useNavigate();
  const location = useLocation();
  const { bump } = useDataVersion();
  const toast = useToast();
  const from = (location.state as { from?: string; email?: string } | null)?.from ?? "/";
  const presetEmail = (location.state as { email?: string } | null)?.email ?? "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string; code?: string }>({});
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<Social | null>(null);
  const [socialBusy, setSocialBusy] = useState<Social | null>(null);
  const googleSlot = useRef<HTMLDivElement>(null);
  const [checkEmail, setCheckEmail] = useState<string | null>(null);

  useEffect(() => {
    setErrors({});
    setPassword("");
  }, [mode]);

  const finish = (created: boolean, who?: string) => {
    bump();
    toast(created ? `Bienvenue${who ? `, ${who.split(" ")[0]}` : ""} ! Votre compte est prêt.` : "Vous êtes connecté·e.");
    navigate(from === "/bienvenue" || from === "/connexion" ? "/" : from, { replace: true });
  };

  const social = async (provider: Social, profile: ProviderProfile) => {
    setSocialBusy(provider);
    try {
      const r = await signInWithProvider({ provider, ...profile });
      finish(r.created, profile.name);
    } catch (e) {
      setErrors({ form: (e as Error).message });
    } finally {
      setSocialBusy(null);
    }
  };

  // Google's own button, when a client ID is configured
  useEffect(() => {
    if (MODE !== "local" || !googleReady || !googleSlot.current) return;
    const el = googleSlot.current;
    mountGoogleButton(el, (p) => social("google", p), Math.min(400, el.clientWidth || 320)).catch((e: Error) => setErrors({ form: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const onGoogle = async () => {
    if (MODE === "local") return setDemo("google");
    setSocialBusy("google");
    try {
      await startOAuth("google"); // leaves the page for Google
    } catch (e) {
      setErrors({ form: (e as Error).message });
      setSocialBusy(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (mode === "signup" && !name.trim()) errs.name = "Indiquez votre nom.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Cette adresse e-mail n'est pas valide.";
    if (mode === "signup" ? password.length < 8 : !password) errs.password = mode === "signup" ? "Au moins 8 caractères." : "Saisissez votre mot de passe.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`auth-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const r = await signUp({ name, email, password });
        if (r.needsConfirmation) setCheckEmail(email.trim().toLowerCase());
        else finish(true, name);
      } else {
        await signIn(email, password);
        finish(false);
      }
    } catch (err) {
      const a = err as ApiError;
      if (a.code === "validation_name") setErrors({ name: a.message });
      else if (a.code === "validation_email") setErrors({ email: a.message });
      else if (a.code === "validation_password" || a.code === "invalid_credentials") setErrors({ password: a.message, code: a.code });
      else setErrors({ form: a.message, code: a.code });
    } finally {
      setBusy(false);
    }
  };

  if (session.data?.signedIn) return <Navigate to="/" replace />;

  if (checkEmail) {
    return (
      <main className="auth">
        <div className="auth__card">
          <span className="brand">
            <span className="brand__mark" aria-hidden="true" />
            litrium
          </span>
          <div className="success">
            <span className="success__icon">
              <Icon name="check" />
            </span>
            <h1>Vérifiez vos e-mails</h1>
            <p className="muted">
              Nous avons envoyé un lien de confirmation à <strong>{checkEmail}</strong>. Cliquez dessus pour activer votre compte : vous serez connecté·e automatiquement.
            </p>
            <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
              Rien reçu ? Regardez dans les courriers indésirables, ou attendez une minute.
            </p>
          </div>
          <Link to="/connexion" replace className="btn btn--ghost btn--md" onClick={() => setCheckEmail(null)}>
            J'ai confirmé, me connecter
          </Link>
        </div>
      </main>
    );
  }

  const signup = mode === "signup";

  return (
    <main className="auth">
      <div className="auth__card">
        <span className="brand">
          <span className="brand__mark" aria-hidden="true" />
          litrium
        </span>
        <div>
          <h1>{signup ? "Créez votre compte" : "Bon retour parmi nous"}</h1>
          <p className="muted">{signup ? "Météo, agenda, alarmes, assistant et messages, au même endroit." : "Connectez-vous pour retrouver vos données."}</p>
        </div>

        <nav className="auth-tabs" aria-label="Choisir">
          <Link to="/bienvenue" replace state={location.state} aria-current={signup ? "page" : undefined}>
            Créer un compte
          </Link>
          <Link to="/connexion" replace state={location.state} aria-current={!signup ? "page" : undefined}>
            Se connecter
          </Link>
        </nav>

        {SHOW_GOOGLE && (
          <>
            <div className="social">
              {MODE === "local" && googleReady ? (
                <div ref={googleSlot} className="social__google" aria-label="Continuer avec Google" />
              ) : (
                <Button className="social__btn social__btn--google" onClick={onGoogle} loading={socialBusy === "google"}>
                  Continuer avec Google
                </Button>
              )}
            </div>
            <div className="divider" role="separator">
              <span>ou avec votre e-mail</span>
            </div>
          </>
        )}

        {errors.form && (
          <div className="form-error" role="alert">
            {errors.form}
            {errors.code === "exists" && (
              <>
                {" "}
                <Link to="/connexion" replace state={{ ...(location.state as object), email }}>
                  Se connecter
                </Link>
              </>
            )}
            {errors.code === "not_found" && (
              <>
                {" "}
                <Link to="/bienvenue" replace state={{ ...(location.state as object), email }}>
                  Créer un compte
                </Link>
              </>
            )}
          </div>
        )}

        <form className="stack" onSubmit={submit} noValidate>
          {signup && <TextInput id="auth-name" label="Nom" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />}
          <TextInput id="auth-email" label="Adresse e-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoFocus={!signup} />
          <div className="pw">
            <TextInput
              id="auth-password"
              label="Mot de passe"
              type={showPw ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              hint={signup ? "8 caractères minimum." : undefined}
            />
            <button type="button" className="pw__toggle" onClick={() => setShowPw((s) => !s)} aria-pressed={showPw}>
              {showPw ? "Masquer" : "Afficher"}
            </button>
          </div>
          {!signup && MODE === "remote" && (
            <Link to="/mot-de-passe-oublie" state={{ email }} className="auth__forgot">
              Mot de passe oublié ?
            </Link>
          )}
          <Button variant="ink" type="submit" loading={busy}>
            {signup ? "Créer mon compte" : "Se connecter"}
          </Button>
        </form>

        <p className="auth__foot muted">
          {signup ? (
            <>
              Déjà un compte ?{" "}
              <Link to="/connexion" replace state={location.state}>
                Se connecter
              </Link>
            </>
          ) : (
            <>
              Pas encore de compte ?{" "}
              <Link to="/bienvenue" replace state={location.state}>
                Créer un compte
              </Link>
              {MODE === "local" && (
                <>
                  <br />
                  Compte de démonstration : camille@exemple.fr / demo1234
                </>
              )}
            </>
          )}
        </p>
      </div>

      {demo && <DemoProvider provider={demo} onClose={() => setDemo(null)} onDone={(p) => social(demo, p)} />}
    </main>
  );
}

/** Stand-in while Google / Apple are not configured: clearly a simulation. */
function DemoProvider({ provider, onClose, onDone }: { provider: Social; onClose: () => void; onDone: (p: ProviderProfile) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Adresse e-mail invalide.");
    onClose();
    onDone({ sub: `demo-${provider}-${email.trim().toLowerCase()}`, email, name });
  };
  return (
    <Modal
      title={`Continuer avec ${LABEL[provider]} (démo)`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="ink" type="submit" form="demo-provider">
            Continuer
          </Button>
        </>
      }
    >
      <p className="notice notice--warn">
        La connexion {LABEL[provider]} n'est pas encore configurée sur ce site. En attendant, cette fenêtre la simule : indiquez le compte {LABEL[provider]} à utiliser.
      </p>
      <form id="demo-provider" className="stack" onSubmit={submit} noValidate>
        <TextInput label="Nom" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus />
        <TextInput label={`E-mail du compte ${LABEL[provider]}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} autoComplete="email" />
      </form>
    </Modal>
  );
}
