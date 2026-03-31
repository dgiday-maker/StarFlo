/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, ReactNode } from 'react';
import { Voucher, AppView, PrintSettings, UserProfile, UserRole, OffsetField } from './types';
import VoucherList from './components/VoucherList';
import VoucherForm from './components/VoucherForm';
import VoucherPrintView from './components/VoucherPrintView';
import FullVoucherPrintView from './components/FullVoucherPrintView';
import ProfileSettings from './components/ProfileSettings';
import VoucherPreviewModal from './components/VoucherPreviewModal';
import UserManagement from './components/UserManagement';
import PayeeManagement from './components/PayeeManagement';
import AccountManagement from './components/AccountManagement';
import { Logo } from './components/Logo';
import { Printer, FileText, LayoutDashboard, Settings, LogOut, LogIn, User as UserIcon, AlertTriangle, UserCog, Users, Contact, BookOpen, PlusCircle, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, orderBy, setDoc, deleteDoc, updateDoc, getDoc, where, getDocs } from 'firebase/firestore';

// Error Boundary Component (Disabled due to TS issues)
const ErrorBoundary = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};

const defaultSettings: PrintSettings = {
  organizationName: 'StarNet Technologies',
  companyName: 'StarNet Technologies PLC',
  companyLogo: '',
  bankName: '',
  bankAccountCode: '',
  publicUrl: '',
  date: { top: 40, left: 500 },
  payee: { top: 100, left: 100 },
  amountFigures: { top: 100, left: 550 },
  amountWords: { top: 150, left: 60 },
  checkNumberOffset: { top: 20, left: 550 },
  defaultPreparedBy: '',
  defaultAuthorizedBy1: '',
  defaultAuthorizedBy2: '',
  defaultAuthorizedBy3: '',
  defaultReceivedBy: '',
  voucherNumberPattern: 'CPV-2026-',
  nextVoucherNumber: 1,
  nextCheckNumber: 1,
};

const getInitials = (name: string): string => {
  if (!name) return 'U';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [printSettings, setPrintSettings] = useState<PrintSettings>(defaultSettings);
  const [view, setView] = useState<AppView>('list');
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [previewVoucher, setPreviewVoucher] = useState<Voucher | null>(null);

  // URL State Sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get('view') as AppView;
    const urlVoucherId = params.get('voucherId');

    if (urlView && ['list', 'new', 'print', 'full-print', 'settings', 'users', 'payees', 'accounts'].includes(urlView)) {
      setView(urlView);
    }
    
    if (urlVoucherId && vouchers.length > 0) {
      const voucher = vouchers.find(v => v.id === urlVoucherId);
      if (voucher) {
        setSelectedVoucher(voucher);
      }
    }
  }, [vouchers.length]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('view', view);
    if (selectedVoucher) {
      params.set('voucherId', selectedVoucher.id);
    } else {
      params.delete('voucherId');
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [view, selectedVoucher]);

  // Handle Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch or create user profile
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          const isDefaultAdmin = currentUser.email === 'starnettechplc@gmail.com';
          
          // Auto-repair: If default admin is inactive, activate them
          if (isDefaultAdmin && !data.active) {
            await updateDoc(userDocRef, { active: true, role: 'admin' });
            setUserProfile({ ...data, active: true, role: 'admin' });
          } else {
            setUserProfile(data);
          }
        } else {
          // Check if there's a pending invitation by email
          const q = query(collection(db, 'users'), where('email', '==', currentUser.email?.toLowerCase()));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            // Claim the pending invite
            const pendingDoc = querySnapshot.docs[0];
            const pendingData = pendingDoc.data();
            
            const newProfile: UserProfile = {
              ...pendingData as UserProfile,
              uid: currentUser.uid, // Use the real UID
              displayName: currentUser.displayName || pendingData.displayName,
            };
            
            // Delete the pending doc and create the real one
            await deleteDoc(doc(db, 'users', pendingDoc.id));
            await setDoc(userDocRef, newProfile);
            setUserProfile(newProfile);
          } else {
            // Create default profile
            const isDefaultAdmin = currentUser.email === 'starnettechplc@gmail.com';
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'User',
              role: isDefaultAdmin ? 'admin' : 'preparer',
              active: isDefaultAdmin, // Default admin is active, others are inactive
              createdAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, newProfile);
            setUserProfile(newProfile);
          }
        }
      } else {
        setUserProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Sync Vouchers from Firestore
  useEffect(() => {
    const isDefaultAdmin = user?.email === 'starnettechplc@gmail.com';
    if (!user || (!userProfile?.active && !isDefaultAdmin)) {
      setVouchers([]);
      return;
    }

    const q = query(collection(db, 'vouchers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Voucher[];
      setVouchers(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'vouchers');
    });

    return () => unsubscribe();
  }, [user, userProfile]);

  // Sync Settings from Firestore
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as any;
        // Merge with defaults to ensure all fields have values (handles coordinate system changes)
        const mergedSettings: PrintSettings = {
          ...defaultSettings,
          ...data,
          date: { ...defaultSettings.date, ...(data.date || {}) },
          payee: { ...defaultSettings.payee, ...(data.payee || {}) },
          amountFigures: { ...defaultSettings.amountFigures, ...(data.amountFigures || {}) },
          amountWords: { ...defaultSettings.amountWords, ...(data.amountWords || {}) },
          checkNumberOffset: { ...defaultSettings.checkNumberOffset, ...(data.checkNumberOffset || {}) },
        } as PrintSettings;
        setPrintSettings(mergedSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });

    return () => unsubscribe();
  }, [user]);

  const handleSaveVoucher = async (newVoucher: Omit<Voucher, 'id' | 'createdAt' | 'createdBy'>) => {
    if (!user || !userProfile) return;

    try {
      const voucherData = {
        ...newVoucher,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
      };
      await setDoc(doc(collection(db, 'vouchers')), voucherData);

      // Increment numbering in settings
      const updatedSettings = {
        ...printSettings,
        nextVoucherNumber: (printSettings.nextVoucherNumber || 1) + 1,
        nextCheckNumber: (printSettings.nextCheckNumber || 1) + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };
      await setDoc(doc(db, 'settings', 'global'), updatedSettings);
      setPrintSettings(updatedSettings);

      setView('list');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'vouchers');
    }
  };

  const handleVerifyVoucher = async (id: string) => {
    if (!user || !userProfile) return;
    try {
      await updateDoc(doc(db, 'vouchers', id), {
        status: 'verified',
        verifiedBy: userProfile.displayName,
        verifiedByUid: user.uid,
        verifiedAt: new Date().toISOString(),
        verifiedSignature: userProfile.signatureUrl || '',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `vouchers/${id}`);
    }
  };

  const handleApproveVoucher = async (id: string) => {
    if (!user || !userProfile) return;
    try {
      await updateDoc(doc(db, 'vouchers', id), {
        status: 'approved',
        approvedBy: userProfile.displayName,
        approvedByUid: user.uid,
        approvedAt: new Date().toISOString(),
        approvedSignature: userProfile.signatureUrl || '',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `vouchers/${id}`);
    }
  };

  const handleDeleteVoucher = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'vouchers', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `vouchers/${id}`);
    }
  };

  const handlePrint = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setView('print');
  };

  const handleFullPrint = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setView('full-print');
  };

  const handleAdjustField = async (field: OffsetField, axis: 'top' | 'left', delta: number) => {
    if (!user) return;

    const currentField = printSettings[field] || { top: 0, left: 0 };
    const newSettings = {
      ...printSettings,
      [field]: {
        ...currentField,
        [axis]: (currentField[axis] || 0) + delta,
      },
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    };

    // Optimistic UI
    setPrintSettings(newSettings);

    try {
      await setDoc(doc(db, 'settings', 'global'), newSettings);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
    }
  };

  const handleResetSettings = async () => {
    if (!user) return;
    const resetData = {
      ...defaultSettings,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    };
    try {
      await setDoc(doc(db, 'settings', 'global'), resetData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
    }
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request') {
        console.log('Login popup already open, ignoring duplicate request.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        console.log('Login popup closed by user.');
      } else {
        console.error('Login error:', error);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-mono">
        <div className="animate-pulse text-gray-400">Initializing System...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-netsuite-blue flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-12 rounded-lg shadow-2xl border border-netsuite-blue/20 text-center space-y-8">
          <Logo className="w-24 h-24 mx-auto text-netsuite-blue" />
          <div className="space-y-2">
            <h1 className="text-3xl font-sans font-bold text-netsuite-blue tracking-tight">Smart Voucher</h1>
            <p className="text-netsuite-blue/60 font-sans text-xs uppercase tracking-[0.2em]">StarNet Technologies</p>
          </div>
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className={`w-full flex items-center justify-center gap-3 bg-netsuite-blue text-white px-8 py-4 rounded-lg hover:bg-netsuite-blue-dark transition-all font-sans text-sm shadow-lg active:scale-95 transform ${isLoggingIn ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <LogIn size={20} className={isLoggingIn ? 'animate-spin' : ''} />
            {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
          <p className="text-[10px] text-gray-400 font-sans leading-relaxed">
            Authorized Personnel Only. All access is logged and monitored.
          </p>
        </div>
      </div>
    );
  }

  if (userProfile && !userProfile.active && userProfile.email !== 'starnettechplc@gmail.com') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-lg w-full bg-white border border-red-100 rounded-3xl p-10 shadow-xl text-center"
        >
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
            <AlertTriangle size={40} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Account Pending Activation</h1>
          <div className="space-y-4 text-gray-600 mb-8">
            <p>Welcome, <span className="font-bold text-netsuite-blue">{userProfile.displayName}</span>.</p>
            <p>Your account has been created but is currently <span className="text-red-500 font-bold">Inactive</span>.</p>
            <p className="text-sm bg-gray-50 p-4 rounded-xl border border-gray-100 italic">
              "Please contact your System Administrator to activate your account and assign your operational role."
            </p>
          </div>
          
          <button
            onClick={logout}
            className="px-8 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold flex items-center justify-center gap-2 mx-auto hover:bg-gray-200 transition-all"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-netsuite-blue selection:text-white">
        {/* Sidebar Navigation (Hidden during print) */}
        <aside className="fixed left-0 top-0 h-full w-16 bg-[#333333] flex flex-col items-center py-6 gap-6 print:hidden z-50">
          <Logo className="w-10 h-10 text-white" src={printSettings.companyLogo} />
          <nav className="flex flex-col gap-4">
            <button
              onClick={() => setView('list')}
              className={`p-2 rounded transition-all ${view === 'list' ? 'bg-netsuite-blue text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              title="Dashboard"
            >
              <LayoutDashboard size={20} />
            </button>
            {(userProfile?.role === 'preparer' || userProfile?.role === 'admin') && (
              <button
                onClick={() => setView('new')}
                className={`p-2 rounded transition-all ${view === 'new' ? 'bg-netsuite-blue text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                title="New Voucher"
              >
                <PlusCircle size={20} />
              </button>
            )}
            {userProfile?.role === 'admin' && (
              <>
                <button
                  onClick={() => setView('payees')}
                  className={`p-2 rounded transition-all ${view === 'payees' ? 'bg-netsuite-blue text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                  title="Payee Registry"
                >
                  <Contact size={20} />
                </button>
                <button
                  onClick={() => setView('accounts')}
                  className={`p-2 rounded transition-all ${view === 'accounts' ? 'bg-netsuite-blue text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                  title="Chart of Accounts"
                >
                  <BookOpen size={20} />
                </button>
                <button
                  onClick={() => setView('users')}
                  className={`p-2 rounded transition-all ${view === 'users' ? 'bg-netsuite-blue text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                  title="User Management"
                >
                  <Users size={20} />
                </button>
              </>
            )}
            {userProfile?.role === 'admin' && (
              <button
                onClick={() => setView('settings')}
                className={`p-2 rounded transition-all ${view === 'settings' ? 'bg-netsuite-blue text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                title="Settings"
              >
                <Settings size={20} />
              </button>
            )}
          </nav>
          <div className="mt-auto flex flex-col gap-4">
            <button 
              onClick={() => setView('settings')}
              className={`flex flex-col items-center gap-2 group transition-all ${view === 'settings' ? 'scale-110' : 'hover:scale-105'}`}
              title="Profile Settings"
            >
              <div className={`w-8 h-8 rounded border flex items-center justify-center overflow-hidden transition-all ${view === 'settings' ? 'bg-white text-netsuite-blue border-white' : 'bg-netsuite-blue text-white border-white/20 group-hover:border-white/40'}`}>
                <span className="text-xs font-bold">
                  {getInitials(userProfile?.displayName || user.email || 'U')}
                </span>
              </div>
            </button>
            <button 
              onClick={logout}
              className="p-2 text-gray-400 hover:text-red-400 transition-colors"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="pl-16 min-h-screen print:pl-0">
          <header className="h-14 border-b border-gray-200 bg-white flex items-center px-8 justify-between sticky top-0 z-40 print:hidden">
            <div className="flex items-center gap-3">
              <Logo src={printSettings.companyLogo} className="w-8 h-8 text-netsuite-blue" />
              <h1 className="text-lg font-sans font-bold tracking-tight text-gray-800">Smart Voucher</h1>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const url = printSettings.publicUrl || window.location.href;
                    window.open(url, '_blank');
                  }}
                  className="flex items-center gap-2 text-gray-500 hover:text-netsuite-blue transition-colors font-sans text-xs"
                  title="Open app in a new tab for better printing and full-screen experience"
                >
                  <ExternalLink size={14} />
                  Open in New Tab
                </button>
                <div className="w-px h-4 bg-gray-200 mx-1" />
                <button
                  onClick={() => {
                    const url = printSettings.publicUrl || window.location.href;
                    navigator.clipboard.writeText(url);
                    // No alert as per iframe guidelines
                  }}
                  className="flex items-center gap-2 text-gray-500 hover:text-netsuite-blue transition-colors font-sans text-xs"
                  title="Copy current app link to clipboard"
                >
                  <LinkIcon size={14} />
                  Copy Link
                </button>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-right">
                <p className="text-[10px] font-sans text-gray-400 uppercase tracking-widest">Operator</p>
                <p className="text-xs font-sans text-netsuite-blue font-bold">{userProfile?.displayName || user.email}</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-right">
                <p className="text-[10px] font-sans text-gray-400 uppercase tracking-widest">System Status</p>
                <p className="text-xs font-sans text-netsuite-blue font-bold uppercase">Connected</p>
              </div>
            </div>
          </header>

          <div className="p-8 max-w-7xl mx-auto print:p-0">
            <AnimatePresence mode="wait">
              {view === 'list' && (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <VoucherList
                    vouchers={vouchers}
                    onPrint={handlePrint}
                    onFullPrint={handleFullPrint}
                    onPreview={(v) => setPreviewVoucher(v)}
                    onDelete={handleDeleteVoucher}
                    onVerify={handleVerifyVoucher}
                    onApprove={handleApproveVoucher}
                    onNew={() => setView('new')}
                    currentUser={user}
                    userRole={userProfile?.role || 'preparer'}
                  />
                </motion.div>
              )}

              {view === 'new' && (
                <motion.div
                  key="new"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                >
                  <VoucherForm
                    onSave={handleSaveVoucher}
                    onCancel={() => setView('list')}
                    userProfile={userProfile}
                    settings={printSettings}
                  />
                </motion.div>
              )}

              {view === 'users' && userProfile?.role === 'admin' && (
                <motion.div
                  key="users"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                >
                  <UserManagement />
                </motion.div>
              )}

              {view === 'payees' && userProfile?.role === 'admin' && (
                <motion.div
                  key="payees"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                >
                  <PayeeManagement />
                </motion.div>
              )}

              {view === 'accounts' && userProfile?.role === 'admin' && (
                <motion.div
                  key="accounts"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                >
                  <AccountManagement />
                </motion.div>
              )}

              {view === 'print' && selectedVoucher && (
                <motion.div
                  key="print"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <VoucherPrintView
                    voucher={selectedVoucher}
                    settings={printSettings}
                    onAdjust={handleAdjustField}
                    onReset={handleResetSettings}
                    onBack={() => setView('list')}
                  />
                </motion.div>
              )}

              {view === 'full-print' && selectedVoucher && (
                <motion.div
                  key="full-print"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <FullVoucherPrintView
                    voucher={selectedVoucher}
                    settings={printSettings}
                    onBack={() => setView('list')}
                  />
                </motion.div>
              )}

              {view === 'settings' && userProfile && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <ProfileSettings
                    profile={userProfile}
                    settings={printSettings}
                    onUpdate={async (updates) => {
                      const userDocRef = doc(db, 'users', user.uid);
                      await updateDoc(userDocRef, updates);
                      setUserProfile({ ...userProfile, ...updates });
                    }}
                    onUpdateSettings={async (updates) => {
                      const newSettings = { ...printSettings, ...updates };
                      await setDoc(doc(db, 'settings', 'global'), newSettings);
                      setPrintSettings(newSettings);
                    }}
                    onBack={() => setView('list')}
                    isAdmin={userProfile.role === 'admin'}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
        
        {/* Modals */}
        <AnimatePresence>
          {previewVoucher && (
            <VoucherPreviewModal
              voucher={previewVoucher}
              onClose={() => setPreviewVoucher(null)}
              onPrint={handlePrint}
              onFullPrint={handleFullPrint}
              userRole={userProfile?.role || 'preparer'}
              settings={printSettings}
            />
          )}
        </AnimatePresence>

        <style dangerouslySetInnerHTML={{ __html: globalPrintStyles }} />
      </div>
    </ErrorBoundary>
  );
}

const globalPrintStyles = `
  @media print {
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      height: auto !important;
      background: white !important;
    }
    /* Hide everything by default */
    body * {
      visibility: hidden !important;
    }
    /* Show only the print sheet and its children */
    .print-sheet, .print-sheet *, .print-voucher, .print-voucher * {
      visibility: visible !important;
    }
    /* Ensure no clipping from parents */
    main, .min-h-screen, div {
      overflow: visible !important;
    }
    .print-sheet {
      display: block !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 7in !important;
      height: 3in !important;
      background: white !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  }
  @media screen {
    .print-sheet {
      display: none !important;
    }
    .debug-print .print-sheet {
      display: block !important;
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      border: 2px solid red !important;
      z-index: 10000 !important;
      box-shadow: 0 0 50px rgba(0,0,0,0.5) !important;
      background: white !important;
    }
  }
`;

export { globalPrintStyles };

