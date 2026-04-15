import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
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
    let cancelled = false;

    async function detect() {
      try {
        const result = await ytDetectGoogleAccounts();

        if (cancelled) return;

        if (result.length <= 1) {
          const selectedAuthUser = result[0]?.authUser ?? 0;
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
          onAccountSelected(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    detect();
    return () => {
      cancelled = true;
    };
  }, [onAccountSelected]);

  const handleSelect = async (account: ApiGoogleAccountInfo) => {
    setSelecting(account.authUser);
    try {
      await ytAuthFromBrowser("auto", account.authUser);
      onAccountSelected(account.authUser);
    } catch (err) {
      console.error("[GoogleAccountPicker] auth failed", {
        authUser: account.authUser,
        error: String(err),
      });
      setSelecting(null);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="text-center">
          <h2 className="text-base font-semibold">Selecionar conta Google</h2>
          <p className="text-sm text-muted-foreground">
            Escolha qual conta do Google deseja usar.
          </p>
        </div>

        <ItemGroup>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Item key={i} variant="outline" size="xs">
                  <ItemMedia>
                    <Skeleton className="size-8 rounded-full" />
                  </ItemMedia>
                  <ItemContent>
                    <Skeleton className="h-4 w-32" />
                  </ItemContent>
                </Item>
              ))
            : accounts.map((account) => {
                const isSelecting = selecting === account.authUser;
                return (
                  <Item key={account.authUser} variant="outline" size="xs">
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
                      {account.email && (
                        <ItemDescription>{account.email}</ItemDescription>
                      )}
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelect(account)}
                        disabled={selecting !== null}
                      >
                        {isSelecting && <Spinner data-icon="inline-start" />}
                        Selecionar
                      </Button>
                    </ItemActions>
                  </Item>
                );
              })}
        </ItemGroup>

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" />
            Voltar
          </Button>
        </div>
      </div>
    </div>
  );
}
