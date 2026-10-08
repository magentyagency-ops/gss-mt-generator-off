import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={null}>
        <AuthCard initialMode="login" />
      </Suspense>
    </div>
  );
}
