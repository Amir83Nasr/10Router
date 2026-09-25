"use client";
import Icon from "@/shared/components/Icon";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { AI_PROVIDERS, AUTH_METHODS } from "@/shared/constants/config";

const providerOptions = Object.values(AI_PROVIDERS).map((p) => ({
  value: p.id,
  label: p.name,
}));

const authMethodOptions = Object.values(AUTH_METHODS).map((m) => ({
  value: m.id,
  label: m.name,
}));

function Field({
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  label?: any;
  required?: any;
  error?: any;
  hint?: any;
  className?: string;
  children: any;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className || ""}`}>
      {label && (
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function NewProviderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(false);
  const [formData, setFormData] = useState({
    provider: "",
    authMethod: "api_key",
    apiKey: "",
    displayName: "",
    isActive: true,
  });
  const [errors, setErrors] = useState<any>({});

  const handleChange = (field: any, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const newErrors: any = {};
    if (!formData.provider) newErrors.provider = "Please select a provider";
    if (formData.authMethod === "api_key" && !formData.apiKey) {
      newErrors.apiKey = "API Key is required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push("/dashboard/providers");
      } else {
        const data = await response.json();
        setErrors({ submit: data.error || "Failed to create provider" });
      }
    } catch (error) {
      setErrors({ submit: "An error occurred. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const selectedProvider = AI_PROVIDERS[formData.provider];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Button variant="outline" size="sm" asChild className="mb-4">
          <Link href="/dashboard/providers">
            <Icon name="arrow_back" className="text-lg" />
            Back to Providers
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">Add New Provider</h1>
        <p className="text-muted-foreground mt-2">
          Configure a new AI provider to use with your applications.
        </p>
      </div>

      {/* Form */}
      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Provider Selection */}
            <Field label="Provider" required error={errors.provider}>
              <Select value={formData.provider} onValueChange={(v) => handleChange("provider", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Provider Info */}
            {selectedProvider && (
              <div className="flex items-center gap-3 p-4 rounded-[10px] bg-background border border-border">
                <div className="size-10 rounded-lg flex items-center justify-center bg-background border border-border">
                  <Icon
                    name={selectedProvider.icon}
                    className="text-xl"
                    style={{ color: selectedProvider.color }}
                  />
                </div>
                <div>
                  <p className="font-medium">{selectedProvider.name}</p>
                  <p className="text-sm text-muted-foreground">Selected provider</p>
                </div>
              </div>
            )}

            {/* Auth Method */}
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">
                Authentication Method <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3">
                {authMethodOptions.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => handleChange("authMethod", method.value)}
                    className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border transition-all ${
                      formData.authMethod === method.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <Icon name={method.value === "api_key" ? "key" : "lock"} className="" />
                    <span className="font-medium">{method.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* API Key Input */}
            {formData.authMethod === "api_key" && (
              <Field
                label="API Key"
                required
                error={errors.apiKey}
                hint="Your API key will be encrypted and stored securely."
              >
                <Input
                  type="password"
                  placeholder="Enter your API key"
                  value={formData.apiKey}
                  onChange={(e: any) => handleChange("apiKey", e.target.value)}
                />
              </Field>
            )}

            {/* OAuth2 Button */}
            {formData.authMethod === "oauth2" && (
              <div className="p-4 rounded-[10px] bg-background border border-border">
                <p className="text-sm text-muted-foreground mb-4">
                  Connect your account using OAuth2 authentication.
                </p>
                <Button type="button" variant="secondary">
                  <Icon name="link" />
                  Connect with OAuth2
                </Button>
              </div>
            )}

            {/* Display Name */}
            <Field
              label="Display Name"
              hint="Optional. A friendly name to identify this configuration."
            >
              <Input
                placeholder="e.g., Production API, Dev Environment"
                value={formData.displayName}
                onChange={(e: any) => handleChange("displayName", e.target.value)}
              />
            </Field>

            {/* Active Toggle */}
            <div className="flex items-center gap-3">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => handleChange("isActive", checked)}
                aria-label="Active"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">Active</span>
                <span className="text-xs text-muted-foreground">
                  Enable this provider for use in your applications
                </span>
              </div>
            </div>

            {/* Error Message */}
            {errors.submit && (
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                {errors.submit}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-border">
              <Link href="/dashboard/providers" className="flex-1">
                <Button type="button" variant="ghost" className="w-full">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={loading} className="w-full flex-1">
                {loading && <Loader2 className="size-4 animate-spin" />}
                Create Provider
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
