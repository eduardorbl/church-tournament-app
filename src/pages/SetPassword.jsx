import React, { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { safeRedirect } from "../lib/safeRedirect";

export default function SetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, updatePassword } = useAuth();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const redirectPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return safeRedirect(params.get("redirect"));
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (submitting) return;

    setSubmitting(true);
    setErr(null);
    setMsg(null);

    if (!pwd || pwd.length < 8) {
      setErr("A senha deve ter pelo menos 8 caracteres.");
      setSubmitting(false);
      return;
    }
    if (pwd !== pwd2) {
      setErr("As senhas não coincidem.");
      setSubmitting(false);
      return;
    }

    try {

      const { error } = await updatePassword(pwd);
      if (error) {
        console.error("Password update error:", error);
        setErr("Não foi possível atualizar a senha. O link pode ter expirado — peça um novo.");
        setSubmitting(false);
        return;
      }


      setMsg("Senha definida com sucesso!");
      setTimeout(() => {
        setSubmitting(false);
        navigate(redirectPath, { replace: true });
      }, 1000);
    } catch (error) {
      console.error("Unexpected error:", error);
      setErr("Erro inesperado ao atualizar a senha. Tente novamente.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-auto bg-white p-6 rounded-lg shadow-md">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Bem-vindo!</h2>
          <p className="text-gray-600 mt-2">Defina sua senha para continuar</p>
          <p className="text-xs text-gray-400 mt-2">
            Email: {user?.email}
          </p>
        </div>
        
        {msg && <p className="mb-3 text-green-700 text-center">{msg}</p>}
        {err && <p className="mb-3 text-red-700 text-center">{err}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nova senha
            </label>
            <input
              type="password"
              placeholder="Mínimo 8 caracteres"
              className="w-full p-3 border border-gray-300 rounded-md"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              required
              disabled={submitting}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirme a senha
            </label>
            <input
              type="password"
              placeholder="Digite a senha novamente"
              className="w-full p-3 border border-gray-300 rounded-md"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              required
              disabled={submitting}
            />
          </div>
          
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Configurando perfil..." : "Definir senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
