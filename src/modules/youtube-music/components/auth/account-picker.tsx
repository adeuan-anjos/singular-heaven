import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ytGetAccounts, ytSwitchAccount, type ApiAccountInfo } from "../../services/yt-api";

interface AccountPickerProps {
  onAccountSelected: () => void;
}

export function AccountPicker({ onAccountSelected }: AccountPickerProps) {
  const [accounts, setAccounts] = useState<ApiAccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await ytGetAccounts();
        if (!cancelled) {
          setAccounts(result);
          const channelAccounts = result.filter((a) => a.hasChannel);
          if (channelAccounts.length === 1) {
            await ytSwitchAccount(channelAccounts[0].pageId);
            onAccountSelected();
            return;
          }
          if (channelAccounts.length === 0) {
            onAccountSelected();
            return;
          }
        }
      } catch (err) {
        console.error("[AccountPicker] load failed", { error: String(err) });
        if (!cancelled) onAccountSelected();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [onAccountSelected]);

  const handleSelect = async (account: ApiAccountInfo) => {
    setSwitching(account.pageId ?? "main");
    try {
      await ytSwitchAccount(account.pageId);
      onAccountSelected();
    } catch (err) {
      console.error("[AccountPicker] switch failed", { error: String(err) });
      setSwitching(null);
    }
  };

  const channelAccounts = accounts.filter((a) => a.hasChannel);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="text-center">
          <h2 className="text-base font-semibold">Selecionar canal</h2>
          <p className="text-sm text-muted-foreground">
            Escolha qual canal do YouTube Music deseja usar.
          </p>
        </div>

        <ItemGroup>
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Item key={i} variant="outline" size="xs">
                  <ItemMedia>
                    <Skeleton className="size-8 rounded-full" />
                  </ItemMedia>
                  <ItemContent>
                    <Skeleton className="h-4 w-32" />
                  </ItemContent>
                </Item>
              ))
            : channelAccounts.map((account) => {
                const rowKey = account.pageId ?? "main";
                const isSwitching = switching === rowKey;
                return (
                  <Item key={rowKey} variant="outline" size="xs">
                    <ItemMedia>
                      <Avatar>
                        <AvatarImage
                          src={account.photoUrl ?? undefined}
                          alt={account.name}
                          referrerPolicy="no-referrer"
                        />
                        <AvatarFallback>
                          {account.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{account.name}</ItemTitle>
                      {account.channelHandle && (
                        <ItemDescription>{account.channelHandle}</ItemDescription>
                      )}
                    </ItemContent>
                    <ItemActions>
                      {account.isActive && !isSwitching && (
                        <Check data-icon="inline-start" />
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelect(account)}
                        disabled={switching !== null}
                      >
                        {isSwitching && <Spinner data-icon="inline-start" />}
                        Selecionar
                      </Button>
                    </ItemActions>
                  </Item>
                );
              })}
        </ItemGroup>
      </div>
    </div>
  );
}
