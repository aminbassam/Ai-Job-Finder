import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";

type ConfirmationVariant = "default" | "destructive";

interface ConfirmationOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmationVariant;
}

export function useConfirmationDialog() {
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const close = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((nextOptions: ConfirmationOptions) => {
    setOptions({
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
      variant: "default",
      ...nextOptions,
    });

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const confirmationDialog = options ? (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <AlertDialogContent className="border-[#1F2937] bg-[#111827] text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{options.title}</AlertDialogTitle>
          {options.description ? (
            <AlertDialogDescription className="text-[#9CA3AF]">
              {options.description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-[#374151] bg-[#111827] text-white hover:bg-[#1F2937] hover:text-white">
            {options.cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={
              options.variant === "destructive"
                ? "bg-[#DC2626] text-white hover:bg-[#B91C1C]"
                : "bg-[#4F8CFF] text-white hover:bg-[#4F8CFF]/90"
            }
          >
            {options.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { confirm, confirmationDialog };
}
