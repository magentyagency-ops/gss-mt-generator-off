import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/40 p-6">
      <Suspense fallback={null}>
        <AuthCard initialMode="login" />
      </Suspense>
    </div>
  );
}
