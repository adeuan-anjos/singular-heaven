import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Music,
  AlertCircle,
  ArrowRight,
  Loader2,
  Globe,
  MonitorSmartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface LoginScreenProps {
  onAuthenticated: () => void;
  onSkip: () => void;
}

interface BrowserInfo {
  name: string;
  hasCookies: boolean;
  cookieCount: number;
}

interface AuthStatusResponse {
  authenticated: boolean;
  method: string;
}

const BROWSER_LABELS: Record<string, string> = {
  edge: "Microsoft Edge",
  chrome: "Google Chrome",
  firefox: "Mozilla Firefox",
  brave: "Brave",
  chromium: "Chromium",
  opera: "Opera",
  vivaldi: "Vivaldi",
};

export function LoginScreen({ onAuthenticated, onSkip }: LoginScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [browsers, setBrowsers] = useState<BrowserInfo[]>([]);
  const [detectingBrowsers, setDetectingBrowsers] = useState(true);
  const [browserAuthLoading, setBrowserAuthLoading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      console.log("[LoginScreen] Detecting browsers with YouTube cookies...");
      try {
        const result = await invoke<BrowserInfo[]>("yt_detect_browsers");
        if (!cancelled) {
          console.log("[LoginScreen] Detected browsers:", result);
          setBrowsers(result);
        }
      } catch (err) {
        console.error("[LoginScreen] Failed to detect browsers:", err);
      } finally {
        if (!cancelled) {
          setDetectingBrowsers(false);
        }
      }
    }

    detect();
    return () => { cancelled = true; };
  }, []);

  const handleBrowserAuth = useCallback(async (browser: string) => {
    console.log("[LoginScreen] Starting browser cookie auth:", browser);
    setBrowserAuthLoading(browser);
    setError(null);
    try {
      const result = await invoke<AuthStatusResponse>("yt_auth_from_browser", { browser });
      console.log("[LoginScreen] yt_auth_from_browser result:", result);
      if (result.authenticated) {
        onAuthenticated();
      } else {
        setError("Falha ao autenticar com cookies do navegador.");
      }
    } catch (err) {
      console.error("[LoginScreen] yt_auth_from_browser failed:", err);
      setError(String(err));
    } finally {
      setBrowserAuthLoading(null);
    }
  }, [onAuthenticated]);

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
            recomendações. Basta estar logado no YouTube Music em algum navegador.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Globe className="size-4" />
            <span>Importar do navegador</span>
          </div>

          {detectingBrowsers ? (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Detectando navegadores...</span>
            </div>
          ) : browsers.length > 0 ? (
            <div className="flex flex-col gap-2">
              {browsers.map((browser) => (
                <Button
                  key={browser.name}
                  variant="outline"
                  onClick={() => handleBrowserAuth(browser.name)}
                  disabled={browserAuthLoading !== null}
                  className="w-full justify-start"
                >
                  {browserAuthLoading === browser.name ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <MonitorSmartphone className="mr-2 size-4" />
                  )}
                  {BROWSER_LABELS[browser.name] ?? browser.name}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {browser.cookieCount} cookies
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Nenhum navegador com cookies do YouTube detectado. Faça login no YouTube Music
              em algum navegador e tente novamente.
            </p>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

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
