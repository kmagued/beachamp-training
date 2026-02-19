"use client";

import { useState, useTransition } from "react";
import { Card, Input, Select, Label, Button, DatePicker, Textarea } from "@/components/ui";
import { Loader2, Copy, Check } from "lucide-react";
import { addSinglePlayer } from "../actions";
import { branding } from "@/lib/config/branding";
import type { PackageOption } from "./types";

interface AddPlayerFormProps {
  packages: PackageOption[];
}

export function AddPlayerForm({ packages }: AddPlayerFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [area, setArea] = useState("");
  const [playingLevel, setPlayingLevel] = useState("");
  const [trainingGoals, setTrainingGoals] = useState<string[]>([]);
  const [healthConditions, setHealthConditions] = useState("");
  const [packageId, setPackageId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sessionsTotal, setSessionsTotal] = useState("");
  const [sessionsRemaining, setSessionsRemaining] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  // Success modal
  const [result, setResult] = useState<{ playerName: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function handlePackageChange(id: string) {
    setPackageId(id);
    const pkg = packages.find((p) => p.id === id);
    if (pkg) {
      setSessionsTotal(String(pkg.session_count));
      setSessionsRemaining(String(pkg.session_count));
      setAmount(String(pkg.price));
      if (startDate) {
        const start = new Date(startDate);
        start.setDate(start.getDate() + pkg.validity_days);
        setEndDate(start.toISOString().split("T")[0]);
      }
    }
  }

  function handleStartDateChange(val: string) {
    setStartDate(val);
    const pkg = packages.find((p) => p.id === packageId);
    if (pkg && val) {
      const start = new Date(val);
      start.setDate(start.getDate() + pkg.validity_days);
      setEndDate(start.toISOString().split("T")[0]);
    }
  }

  function handleSubmit() {
    setError("");
    const formData = new FormData();
    formData.set("first_name", firstName);
    formData.set("last_name", lastName);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("date_of_birth", dateOfBirth);
    formData.set("area", area);
    formData.set("playing_level", playingLevel);
    formData.set("training_goals", trainingGoals.join(", "));
    formData.set("health_conditions", healthConditions);
    formData.set("package_id", packageId);
    formData.set("start_date", startDate);
    formData.set("end_date", endDate);
    formData.set("sessions_total", sessionsTotal);
    formData.set("sessions_remaining", sessionsRemaining);
    formData.set("amount", amount);
    formData.set("payment_method", paymentMethod);

    startTransition(async () => {
      const res = await addSinglePlayer(formData);
      if (res.error) {
        setError(res.error);
      } else if (res.success && res.password && res.playerName) {
        setResult({ playerName: res.playerName, password: res.password });
        // Reset form
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
        setDateOfBirth("");
        setArea("");
        setPlayingLevel("");
        setTrainingGoals([]);
        setHealthConditions("");
        setPackageId("");
        setStartDate("");
        setEndDate("");
        setSessionsTotal("");
        setSessionsRemaining("");
        setAmount("");
        setPaymentMethod("cash");
      }
    });
  }

  function handleCopy() {
    if (result) {
      navigator.clipboard.writeText(result.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <>
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>First Name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
          </div>
          <div>
            <Label required>Last Name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
          </div>
          <div>
            <Label required>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="player@email.com" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <Label>Date of Birth</Label>
            <DatePicker
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              placeholder="Date of birth"
            />
          </div>
          <div>
            <Label>Area of Residence</Label>
            <Select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Select area...</option>
              {branding.areas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Playing Level</Label>
            <Select value={playingLevel} onChange={(e) => setPlayingLevel(e.target.value)}>
              <option value="">Select level...</option>
              {branding.levels.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Training Goals</Label>
            <div className="flex flex-wrap gap-2">
              {branding.trainingGoals.map((goal) => {
                const selected = trainingGoals.includes(goal);
                return (
                  <button
                    key={goal}
                    type="button"
                    onClick={() =>
                      setTrainingGoals((prev) =>
                        selected ? prev.filter((g) => g !== goal) : [...prev, goal]
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      selected
                        ? "bg-primary-50 border-primary-300 text-primary-700"
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {goal}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label>Health / Injury Conditions</Label>
            <Textarea
              value={healthConditions}
              onChange={(e) => setHealthConditions(e.target.value)}
              placeholder="Any injuries or health conditions..."
              rows={2}
            />
          </div>
        </div>

        <hr className="my-5 border-slate-200" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label required>Package</Label>
            <Select value={packageId} onChange={(e) => handlePackageChange(e.target.value)}>
              <option value="">Select package...</option>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} — {pkg.price.toLocaleString()} EGP
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label required>Start Date</Label>
            <DatePicker
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              placeholder="Start date"
            />
          </div>
          <div>
            <Label required>End Date</Label>
            <DatePicker
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="End date"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <div>
            <Label required>Sessions Total</Label>
            <Input type="number" min={1} value={sessionsTotal} onChange={(e) => setSessionsTotal(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label required>Sessions Remaining</Label>
            <Input type="number" min={0} value={sessionsRemaining} onChange={(e) => setSessionsRemaining(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label required>Amount (EGP)</Label>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label required>Payment Method</Label>
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="instapay">InstaPay</option>
            </Select>
          </div>
        </div>

        {error && (
          <div className="mt-4 px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mt-6">
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Creating Player...
              </span>
            ) : (
              "Create Player"
            )}
          </Button>
        </div>
      </Card>

      {/* Success Modal */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Player Created</h3>
              <p className="text-sm text-slate-500 mt-1">{result.playerName} has been added</p>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Generated Password
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono bg-white px-3 py-2 rounded border border-slate-200 text-slate-900 select-all">
                  {result.password}
                </code>
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                  title="Copy password"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Share this password with the player. They can change it later.
              </p>
            </div>

            <Button
              fullWidth
              onClick={() => { setResult(null); setCopied(false); }}
            >
              Done
            </Button>
          </Card>
        </div>
      )}
    </>
  );
}
