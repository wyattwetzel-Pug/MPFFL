"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { SettingCard, FormRow } from "@/components/ui/setting-card";
import { sendTestSms } from "@/lib/actions/sms-actions";
import type { TemplateKey } from "@/lib/sms/templates";

/*
 * Sends one message to yourself with sample values, so a template can be read
 * on a real phone before a draft depends on it.
 */
export function SmsTest({ templates }: { templates: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [template, setTemplate] = useState(templates[0]);
  const [result, setResult] = useState<string | null>(null);

  const send = () =>
    start(async () => {
      const res = await sendTestSms(template as TemplateKey);
      setResult(res.ok ? `${res.status}${res.reason ? ` — ${res.reason}` : ""}` : res.error);
      router.refresh();
    });

  return (
    <SettingCard
      title="Send yourself a test"
      description="Goes to you, with sample values. Nobody else is texted."
      footer={result ?? undefined}
    >
      <FormRow>
        <FormField id="tpl" label="Template" className="w-72">
          <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
            {templates.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </FormField>
        <Button className="mt-7" size="sm" loading={pending} disabled={pending} onClick={send}>
          Send
        </Button>
      </FormRow>
    </SettingCard>
  );
}
