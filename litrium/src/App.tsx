import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { subscribe } from "./data/api";
import { DataVersion } from "./lib/useAsync";
import { ToastProvider } from "./ui/Toast";
import { Layout } from "./app/Layout";
import { RequireAuth } from "./app/RequireAuth";
const Home = lazy(() => import("./pages/Home"));
const Weather = lazy(() => import("./pages/Weather"));
const Agenda = lazy(() => import("./pages/Agenda"));
const Alarms = lazy(() => import("./pages/Alarms"));
const Clock = lazy(() => import("./pages/Clock"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Messages = lazy(() => import("./pages/Messages"));
const Thread = lazy(() => import("./pages/Messages").then((m) => ({ default: m.Thread })));
const ThreadPlaceholder = lazy(() => import("./pages/Messages").then((m) => ({ default: m.ThreadPlaceholder })));
const Notes = lazy(() => import("./pages/Notes"));
const Settings = lazy(() => import("./pages/Settings"));
import Auth from "./pages/Auth";
const ForgotPassword = lazy(() => import("./pages/PasswordReset").then((m) => ({ default: m.ForgotPassword })));
const NewPassword = lazy(() => import("./pages/PasswordReset").then((m) => ({ default: m.NewPassword })));
import NotFound from "./pages/NotFound";

export default function App() {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const ctx = useMemo(() => ({ version, bump }), [version, bump]);

  // data that changes on its own (a friend replies, another tab) refreshes every screen
  useEffect(() => {
    const off = subscribe(bump);
    return () => {
      off();
    };
  }, [bump]);

  return (
    <DataVersion.Provider value={ctx}>
      <ToastProvider>
        <div className="backdrop" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
        <Routes>
          <Route path="/bienvenue" element={<Auth mode="signup" />} />
          <Route path="/connexion" element={<Auth mode="login" />} />
          <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
          <Route path="/nouveau-mot-de-passe" element={<NewPassword />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="meteo" element={<Weather />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="horloge" element={<Clock />} />
              <Route path="alarmes" element={<Alarms />} />
              <Route path="assistant" element={<Assistant />} />
              <Route path="messages" element={<Messages />}>
                <Route index element={<ThreadPlaceholder />} />
                <Route path=":friendId" element={<Thread />} />
              </Route>
              <Route path="notes" element={<Notes />} />
              <Route path="parametres" element={<Settings />} />
              <Route path="accueil" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
        </Suspense>
      </ToastProvider>
    </DataVersion.Provider>
  );
}
