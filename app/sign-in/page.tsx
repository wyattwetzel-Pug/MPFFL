"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SignInForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const params = useSearchParams();
  const error = params.get("error");
  // Where they were headed before we asked them to sign in.
  const next = params.get("next");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next }),
    });
    const data = await res.json().catch(() => ({}));
    setDevLink(data.devLink ?? null);
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-xl">
            {sent ? "Check your email" : "Sign in to MPFFL"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                If <span className="font-medium text-foreground">{email}</span> belongs to
                a league owner, a sign-in link is on its way. It expires in 15 minutes.
              </p>
              {devLink && (
                <Alert variant="warning">
                  <AlertTitle>Local development</AlertTitle>
                  <AlertDescription>
                    No email provider is configured, so here is the link:{" "}
                    <a href={devLink} className="font-medium underline">
                      Sign in as {email}
                    </a>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {error === "used"
                      ? "That link was already used. Each link works once — and requesting a new one retires the old, so use the most recent email. Send a fresh link below."
                      : error === "expired"
                        ? "That link expired. Links last 30 minutes — send a fresh one below."
                        : "That sign-in link wasn't valid. If your email app broke it across lines, send a fresh one below."}
                  </AlertDescription>
                </Alert>
              )}
              <FormField id="email" label="Email">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </FormField>
              <Button type="submit" loading={busy} className="w-full">
                Email me a sign-in link
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                No passwords. We email you a link; clicking it signs you in on this device.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
