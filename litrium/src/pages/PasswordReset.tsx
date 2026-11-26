import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getSession, requestPasswordReset, updatePassword } from "../data/api";
import { useAsync } from "../lib/useAsync";
import { Icon } from "../ui/Icon";
import { Button, Skeleton, TextInput } from "../ui/primitives";
import { useToast } from "../ui/Toast";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="auth__card">
        <span className="brand">
          <span className="brand__mark" aria-hidden="true" />
          litrium
        </span>
        {children}
      </div>
    </main>
  );
}

/** /mot-de-passe-oublie : ask for a reset link by e-mail */
export function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      {sent ? (
        <div className="success">
          <span className="success__icon">
            <Icon name="check" />
          </span>
          <h1>E-mail envoyé</h1>
          <p className="muted">
            Si un compte existe pour <strong>{email}</strong>, vous allez recevoir un lien pour choisir un nouveau mot de passe.
          </p>
        </div>
      ) : (
        <>
          <div>
            <h1>Mot de passe oublié</h1>
            <p className="muted">Indiquez votre adresse : nous vous envoyons un lien pour en choisir un nouveau.</p>
          </div>
          <form className="stack" onSubmit={submit} noValidate>
            <TextInput label="Adresse e-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} autoFocus />
            <Button variant="ink" type="submit" loading={busy}>
              Envoyer le lien
            </Button>
          </form>
        </>
      )}
      <p className="auth__foot muted">
        <Link to="/connexion" replace>
          Retour à la connexion
        </Link>
      </p>
    </Shell>
  );
}

/** /nouveau-mot-de-passe : the link from the e-mail lands here, already signed in */
export function NewPassword() {
  const session = useAsync(getSession);
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Au moins 8 caractères.");
    setBusy(true);
    try {
      await updatePassword(password);
      toast("Mot de passe modifié.");
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!session.data) {
    return (
      <Shell>
        <Skeleton h="8rem" />
      </Shell>
    );
  }
  if (!session.data.signedIn) {
    return (
      <Shell>
        <div>
          <h1>Lien expiré</h1>
          <p className="muted">Ce lien n'est plus valable. Demandez-en un nouveau.</p>
        </div>
        <Link to="/mot-de-passe-oublie" className="btn btn--ink btn--md">
          Recevoir un nouveau lien
        </Link>
      </Shell>
    );
  }
  return (
    <Shell>
      <div>
        <h1>Nouveau mot de passe</h1>
        <p className="muted">Choisissez votre nouveau mot de passe (8 caractères minimum).</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <TextInput label="Nouveau mot de passe" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} autoFocus />
        <Button variant="ink" type="submit" loading={busy}>
          Enregistrer
        </Button>
      </form>
    </Shell>
  );
}
