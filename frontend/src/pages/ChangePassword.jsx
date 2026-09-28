import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/RequireAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";

function ChangePasswordInner() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: (payload) => apiPost("/auth/change-password", payload),
    onSuccess: () => {
      toast.success("Password updated successfully");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e) => toast.error(e?.body?.detail || "Could not update password"),
  });

  function onSubmit(e) {
    e.preventDefault();
    if (!current || !next) {
      toast.error("Please fill all required fields");
      return;
    }
    if (next.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("New password and confirmation do not match");
      return;
    }
    change.mutate({ current_password: current, new_password: next });
  }

  return (
    <AppLayout
      title="Update Password"
      subtitle="Change the password you use to sign in to the portal."
    >
      <Card className="p-6 bg-white border-slate-200 rounded-xl shadow-sm max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4" data-testid="change-password-form">
          <div className="space-y-2">
            <Label htmlFor="current">Current Password</Label>
            <Input
              id="current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              data-testid="current-password-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="next">New Password</Label>
            <Input
              id="next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              data-testid="new-password-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm New Password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              data-testid="confirm-password-input"
            />
          </div>
          <Button
            type="submit"
            disabled={change.isPending}
            data-testid="change-password-button"
            className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white gap-2 active:scale-[0.98] [transition:background-color_.18s_ease,transform_.1s_ease]"
          >
            <KeyRound size={15} /> Update Password
          </Button>
        </form>
      </Card>
    </AppLayout>
  );
}

export default function ChangePassword() {
  return (
    <RequireAuth>
      <ChangePasswordInner />
    </RequireAuth>
  );
}
