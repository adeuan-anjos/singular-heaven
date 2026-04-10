import { useState, useEffect } from "react";
import { Mail, Loader2, ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ytDetectGoogleAccounts,
  ytAuthFromBrowser,
  type ApiGoogleAccountInfo,
} from "../../services/yt-api";

interface GoogleAccountPickerProps {
  onAccountSelected: (authUser: number) => void;
  onBack: () => void;
}

export function GoogleAccountPicker({
  onAccountSelected,
  onBack,
}: GoogleAccountPickerProps) {
  const [accounts, setAccounts] = useState<ApiGoogleAccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<number | null>(null);

  useEffect(() => {
    console.log("[GoogleAccountPicker] mounted");
    let cancelled = false;

    async function detect() {
      try {
        console.log("[GoogleAccountPicker] detecting Google accounts...");
        const result = await ytDetectGoogleAccounts();
        console.log("[GoogleAccountPicker] detected accounts", {
          count: result.length,
          names: result.map((a) => a.name),
          authUsers: result.map((a) => a.authUser),
        });

        if (cancelled) return;

        if (result.length <= 1) {
          const selectedAuthUser = result[0]?.authUser ?? 0;
          console.log("[GoogleAccountPicker] single account — auto-skipping picker", {
            authUser: selectedAuthUser,
            name: result[0]?.name ?? "(none)",
          });
          onAccountSelected(selectedAuthUser);
          return;
        }

        setAccounts(result);
      } catch (err) {
        console.error("[GoogleAccountPicker] detection failed", {
          error: String(err),
          detail: err instanceof Error ? err.message : err,
        });
        if (!cancelled) {
          console.log("[GoogleAccountPicker] falling back to authUser=0 due to detection error");
          onAccountSelected(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    detect();
    return () => {
      cancelled = true;
      console.log("[GoogleAccountPicker] unmounted");
    };
  }, [onAccountSelected]);

  const handleSelect = async (account: ApiGoogleAccountInfo) => {
    console.log("[GoogleAccountPicker] account button clicked", {
      name: account.name,
      authUser: account.authUser,
      channelHandle: account.channelHandle ?? null,
    });
    setSelecting(account.authUser);
    try {
      console.log("[GoogleAccountPicker] calling ytAuthFromBrowser with authUser", account.authUser);
      await ytAuthFromBrowser("auto", account.authUser);
      console.log("[GoogleAccountPicker] ytAuthFromBrowser succeeded, notifying parent", {
        authUser: account.authUser,
        name: account.name,
      });
      onAccountSelected(account.authUser);
    } catch (err) {
      console.error("[GoogleAccountPicker] ytAuthFromBrowser failed", {
        authUser: account.authUser,
        name: account.name,
        error: String(err),
      });
      setSelecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  console.log("[GoogleAccountPicker] render", {
    total: accounts.length,
    accounts: accounts.map((a) => ({ authUser: a.authUser, name: a.name, channelHandle: a.channelHandle ?? null })),
    selecting,
  });

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="size-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Selecionar conta Google</CardTitle>
          <CardDescription>
            Escolha qual conta do Google deseja usar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {accounts.map((account) => (
            <button
              key={account.authUser}
              onClick={() => handleSelect(account)}
              disabled={selecting !== null}
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
            >
              {account.photoUrl ? (
                <img
                  referrerPolicy="no-referrer"
                  src={account.photoUrl}
                  alt={account.name}
                  className="size-10 rounded-full"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {account.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {account.name}
                </div>
                {account.email && (
                  <div className="truncate text-xs text-muted-foreground">
                    {account.email}
                  </div>
                )}
              </div>
              {selecting === account.authUser && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
            </button>
          ))}

          <div className="border-t pt-3 text-center">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Voltar
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
