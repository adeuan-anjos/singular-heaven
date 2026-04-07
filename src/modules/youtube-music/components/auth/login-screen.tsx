import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Music, Link, Check, Copy, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type LoginState =
  | { step: "initial" }
  | { step: "pending"; url: string; userCode: string }
  | { step: "error"; message: string };

interface LoginScreenProps {
  onAuthenticated: () => void;
  onSkip: () => void;
}

export function LoginScreen({ onAuthenticated, onSkip }: LoginScreenProps) {
  const [state, setState] = useState<LoginState>({ step: "initial" });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleConnect = useCallback(async () => {
    console.log("[LoginScreen] starting OAuth flow");
    setLoading(true);
    try {
      const result = await invoke<{ url: string; user_code: string }>("yt_auth_start");
      console.log("[LoginScreen] yt_auth_start success", { url: result.url, user_code: result.user_code });
      setState({ step: "pending", url: result.url, userCode: result.user_code });
    } catch (err) {
      console.error("[LoginScreen] yt_auth_start failed", err);
      setState({ step: "error", message: String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleComplete = useCallback(async () => {
    console.log("[LoginScreen] confirming authorization");
    setLoading(true);
    try {
      const result = await invoke<{ success: boolean }>("yt_auth_complete");
      console.log("[LoginScreen] yt_auth_complete result", result);
      if (result.success) {
        onAuthenticated();
      } else {
        setState({ step: "error", message: "A autorização não foi concluída. Tente novamente." });
      }
    } catch (err) {
      console.error("[LoginScreen] yt_auth_complete failed", err);
      setState({ step: "error", message: String(err) });
    } finally {
      setLoading(false);
    }
  }, [onAuthenticated]);

  const handleOpenUrl = useCallback(async (url: string) => {
    console.log("[LoginScreen] opening URL in browser", { url });
    try {
      await openUrl(url);
    } catch (err) {
      console.error("[LoginScreen] failed to open URL", err);
    }
  }, []);

  const handleCopyCode = useCallback(async (code: string) => {
    console.log("[LoginScreen] copying code to clipboard");
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[LoginScreen] clipboard write failed", err);
    }
  }, []);

  const handleCancel = useCallback(() => {
    console.log("[LoginScreen] cancelling OAuth flow");
    setState({ step: "initial" });
  }, []);

  const handleRetry = useCallback(() => {
    console.log("[LoginScreen] retrying OAuth flow");
    setState({ step: "initial" });
    handleConnect();
  }, [handleConnect]);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Music className="size-6 text-primary" />
          </div>
          <CardTitle className="text-xl">YouTube Music</CardTitle>
          <CardDescription>
            Conecte sua conta do Google para acessar sua biblioteca, playlists e
            recomendações.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/* Initial state */}
          {state.step === "initial" && (
            <Button
              onClick={handleConnect}
              disabled={loading}
              size="lg"
              className="w-full"
            >
              {loading ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Link className="size-4" data-icon="inline-start" />
              )}
              Conectar com Google
            </Button>
          )}

          {/* Pending state — device code flow */}
          {state.step === "pending" && (
            <div className="flex flex-col gap-4">
              <ol className="flex flex-col gap-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                    1
                  </span>
                  <span>
                    Acesse:{" "}
                    <button
                      onClick={() => handleOpenUrl(state.url)}
                      className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                    >
                      {state.url}
                    </button>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                    2
                  </span>
                  <span>Digite o código:</span>
                </li>
              </ol>

              <div className="flex items-center justify-center gap-2 rounded-lg bg-muted px-4 py-3">
                <span className="font-mono text-2xl font-bold tracking-widest text-foreground">
                  {state.userCode}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleCopyCode(state.userCode)}
                  aria-label="Copiar código"
                >
                  {copied ? (
                    <Check className="size-4 text-green-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>

              <ol start={3} className="flex flex-col gap-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                    3
                  </span>
                  <span>Faça login com sua conta Google</span>
                </li>
              </ol>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  className="flex-1"
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleComplete}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Check className="size-4" data-icon="inline-start" />
                  )}
                  Já autorizei
                </Button>
              </div>
            </div>
          )}

          {/* Error state */}
          {state.step === "error" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{state.message}</span>
              </div>
              <Button onClick={handleRetry} disabled={loading} className="w-full">
                {loading ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : null}
                Tentar novamente
              </Button>
            </div>
          )}

          {/* Skip option — always visible */}
          <div className="border-t pt-3 text-center">
            <button
              onClick={onSkip}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Continuar sem login
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
