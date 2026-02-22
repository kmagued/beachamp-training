export interface PaymentImportRow {
  email: string;
  date: string;
  amount: number;
  package: string;
  method: string;
}

export interface PaymentImportResult {
  email: string;
  package: string;
  amount: number;
  status: "success" | "error";
  error?: string;
}

export interface PackageInfo {
  id: string;
  name: string;
  session_count: number;
  validity_days: number;
}
