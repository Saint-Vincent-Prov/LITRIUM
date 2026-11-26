import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { subscribe } from "./data/api";
import { DataVersion } from "./lib/useAsync";
import { ToastProvider } from "./ui/Toast";
import { Layout } from "./app/Layout";
import { RequireAuth } from "./app/RequireAuth";
import Home from "./pages/Home";
import Weather from "./pages/Weather";
import Agenda from "./pages/Agenda";
import Alarms from "./pages/Alarms";
import Assistant from "./pages/Assistant";
import Messages, { Thread, ThreadPlaceholder } from "./pages/Messages";
import Notes from "./pages/Notes";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import { ForgotPassword, NewPassword } from "./pages/PasswordReset";
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
      </ToastProvider>
    </DataVersion.Provider>
  );
}
