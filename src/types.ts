export type VoucherStatus = 'draft' | 'prepared' | 'verified' | 'approved' | 'void';
export type UserRole = 'preparer' | 'verifier' | 'approver' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  signatureUrl?: string;
  createdAt: string;
}

export interface AccountingEntry {
  accountCode: string;
  description: string;
  debit: number;
  credit: number;
  debitUSD?: number;
  creditUSD?: number;
}

export interface Voucher {
  id: string;
  voucherNumber: string;
  date: string;
  payee: string;
  amount: number;
  checkNumber?: string;
  exchangeRate?: number;
  accountDetails: string;
  entries: AccountingEntry[];
  attachments?: string[]; // Base64 strings of attached documents
  status: VoucherStatus;
  preparedBy: string;
  preparedByUid?: string;
  preparedAt?: string;
  preparedSignature?: string;
  verifiedBy: string;
  verifiedByUid?: string;
  verifiedAt?: string;
  verifiedSignature?: string;
  approvedBy: string;
  approvedByUid?: string;
  approvedAt?: string;
  approvedSignature?: string;
  receivedBy: string;
  createdAt: string;
  createdBy: string;
}

export interface FieldOffset {
  top: number;
  left: number;
}

export type OffsetField = 'date' | 'payee' | 'amountFigures' | 'amountWords' | 'checkNumberOffset';

export interface PrintSettings {
  organizationName: string;
  companyName?: string;
  companyLogo?: string;
  bankName?: string;
  bankAccountCode?: string;
  publicUrl?: string;
  date: FieldOffset;
  payee: FieldOffset;
  amountFigures: FieldOffset;
  amountWords: FieldOffset;
  checkNumberOffset: FieldOffset;
  defaultPreparedBy?: string;
  defaultAuthorizedBy1?: string;
  defaultAuthorizedBy2?: string;
  defaultAuthorizedBy3?: string;
  defaultReceivedBy?: string;
  voucherNumberPattern?: string; // e.g., "CPV-2024-"
  checkNumberPattern?: string; // e.g., "CHQ-"
  nextVoucherNumber?: number;
  nextCheckNumber?: number;
}

export interface Payee {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  createdAt: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  description?: string;
  createdAt: string;
}

export type AppView = 'list' | 'new' | 'print' | 'full-print' | 'settings' | 'users' | 'payees' | 'accounts';
