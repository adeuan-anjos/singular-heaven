import { useState, useEffect } from "react";
import { Users, Loader2, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ytGetAccounts, ytSwitchAccount, type ApiAccountInfo } from "../../services/yt-api";

interface AccountPickerProps {
  onAccountSelected: () => void;
}

export function AccountPicker({ onAccountSelected }: AccountPickerProps) {
  const [accounts, setAccounts] = useState<ApiAccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    console.log("[AccountPicker] mounted");
    let cancelled = false;
    async function load() {
      try {
        console.log("[AccountPicker] loading accounts via ytGetAccounts...");
        const result = await ytGetAccounts();
        console.log("[AccountPicker] accounts loaded", {
          total: result.length,
          accounts: result.map((a) => ({
            name: a.name,
            pageId: a.pageId ?? null,
            hasChannel: a.hasChannel,
            isActive: a.isActive,
            channelHandle: a.channelHandle ?? null,
          })),
        });
        if (!cancelled) {
          setAccounts(result);
          // If only one account with a channel, auto-select it
          const channelAccounts = result.filter((a) => a.hasChannel);
          console.log("[AccountPicker] channel accounts", { count: channelAccounts.length });
          if (channelAccounts.length === 1) {
            console.log("[AccountPicker] auto-selecting single channel account", {
              name: channelAccounts[0].name,
              pageId: channelAccounts[0].pageId ?? null,
            });
            await ytSwitchAccount(channelAccounts[0].pageId);
            onAccountSelected();
            return;
          }
          // If no channel accounts, proceed without switching
          if (channelAccounts.length === 0) {
            console.log("[AccountPicker] no channel accounts found, proceeding without switching");
            onAccountSelected();
            return;
          }
        }
      } catch (err) {
        console.error("[AccountPicker] failed to load accounts", { error: String(err) });
        if (!cancelled) {
          console.log("[AccountPicker] proceeding despite error");
          onAccountSelected();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      console.log("[AccountPicker] unmounted");
    };
  }, [onAccountSelected]);

  const handleSelect = async (account: ApiAccountInfo) => {
    console.log("[AccountPicker] account button clicked", {
      name: account.name,
      pageId: account.pageId ?? null,
      channelHandle: account.channelHandle ?? null,
    });
    setSwitching(account.pageId ?? "main");
    try {
      console.log("[AccountPicker] calling ytSwitchAccount", { pageId: account.pageId ?? null });
      await ytSwitchAccount(account.pageId);
      console.log("[AccountPicker] account switched successfully", {
        name: account.name,
        pageId: account.pageId ?? null,
      });
      onAccountSelected();
    } catch (err) {
      console.error("[AccountPicker] failed to switch account", {
        name: account.name,
        pageId: account.pageId ?? null,
        error: String(err),
      });
      setSwitching(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Filter to only show accounts with channels (those that have YouTube content)
  const channelAccounts = accounts.filter(a => a.hasChannel);

  console.log("[AccountPicker] render", { total: accounts.length, withChannel: channelAccounts.length, switching });

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Users className="size-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Selecionar conta</CardTitle>
          <CardDescription>
            Escolha qual canal do YouTube Music deseja usar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {channelAccounts.map((account) => (
            <button
              key={account.pageId ?? "main"}
              onClick={() => handleSelect(account)}
              disabled={switching !== null}
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
            >
              {account.photoUrl ? (
                <img referrerPolicy="no-referrer"
                  src={account.photoUrl}
                  alt={account.name}
                  className="size-10 rounded-full"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {account.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{account.name}</div>
                {account.channelHandle && (
                  <div className="text-xs text-muted-foreground truncate">{account.channelHandle}</div>
                )}
              </div>
              {switching === (account.pageId ?? "main") ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : account.isActive ? (
                <Check className="size-4 text-primary" />
              ) : null}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
