import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Globe,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';
import { pocketbaseService } from '../services/pocketbaseService';
import { LanguageCode, User } from '../types/facility';

interface LoginScreenProps {
  users: User[];
  onSelectUser: (user: User) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ users, onSelectUser }) => {
  const { language, setLanguage, t, tRole } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>(users[0]?.id ?? 'u1');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [adminConfigured, setAdminConfigured] = useState<boolean>(true);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const pocketbaseEnabled = pocketbaseService.isPocketBaseEnabled();
  const selectedUser = users.find((u) => u.id === selectedId) ?? users[0];
  const isAdminSelected = selectedUser?.role === 'admin';
  const showSetupAdminForm = isAdminSelected && !pocketbaseEnabled && !adminConfigured;

  useEffect(() => {
    let active = true;
    void pocketbaseService.getAuthStatus().then((status) => {
      if (!active) return;
      setAdminConfigured(status.adminConfigured);
      setCheckingStatus(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSelectProfile = (user: User) => {
    setSelectedId(user.id);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setErrorMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (showSetupAdminForm) {
      if (password.length < 4) {
        setErrorMsg(t('login.errMinLength'));
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg(t('login.errMismatch'));
        return;
      }
      setSubmitting(true);
      const res = await pocketbaseService.setupAdminAccount(email, password);
      setSubmitting(false);
      if (!res.ok) {
        setErrorMsg(t('login.errInvalid'));
        return;
      }
      if (selectedUser) {
        onSelectUser(selectedUser);
      }
      return;
    }

    if (!isAdminSelected && !pocketbaseEnabled && selectedUser) {
      setSubmitting(true);
      const res = await pocketbaseService.loginDemoNonAdmin(selectedUser.id);
      setSubmitting(false);
      if (!res.ok) {
        setErrorMsg(t('login.errInvalid'));
        return;
      }
      onSelectUser(res.user);
      return;
    }

    if (!password) {
      setErrorMsg(t('login.errInvalid'));
      return;
    }

    setSubmitting(true);
    const res = await pocketbaseService.loginWithCredentials(email, password);
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(
        res.error && res.error !== 'INVALID_CREDENTIALS'
          ? res.error
          : t('login.errInvalid')
      );
      return;
    }
    onSelectUser(res.user);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 border border-slate-700">
              <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" aria-hidden="true">
                <path d="M16 5L5 14V26H10V16L16 11L22 16V26H27V14L16 5Z" fill="#F8FAFC" />
                <rect x="13" y="17" width="6" height="9" rx="1" fill="#F97316" />
                <circle cx="16" cy="13.5" r="1.5" fill="#F97316" />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">HAUSMEISTER PRO</h1>
              <p className="text-xs text-slate-400">{t('login.subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1">
            <Globe className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              aria-label={t('header.language')}
              className="bg-transparent font-mono text-xs font-semibold text-white focus:outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-slate-900 text-white">
                  {l.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {users.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                {t('login.selectUser')}
              </label>
              <div className="space-y-2">
                {users.map((user) => {
                  const active = selectedId === user.id;
                  const RoleIcon =
                    user.role === 'admin'
                      ? ShieldCheck
                      : user.role === 'client_hausverwaltung'
                        ? Building2
                        : Wrench;
                  const roleLabel = tRole(user.role, false);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelectProfile(user)}
                      className={`w-full flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                        active
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <RoleIcon
                          className={`w-5 h-5 shrink-0 ${
                            active ? 'text-orange-400' : 'text-slate-400'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {user.role === 'admin' ? user.email : user.name}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {user.employee_id} · {roleLabel}
                          </p>
                        </div>
                      </div>
                      {active && <UserCheck className="w-4 h-4 text-orange-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!checkingStatus && (isAdminSelected || pocketbaseEnabled) && (
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              {showSetupAdminForm && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <p className="font-semibold flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    {t('login.setupAdminTitle')}
                  </p>
                  <p className="text-[11px] text-amber-200/80 mt-0.5">
                    {t('login.setupAdminHint')}
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  {t('login.emailLabel')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@firma.de"
                    autoComplete="email"
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  {t('login.passwordLabel')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={showSetupAdminForm ? 'new-password' : 'current-password'}
                    placeholder={t('login.passwordPlaceholder')}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3.5 py-2.5 font-mono text-sm text-white focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              {showSetupAdminForm && (
                <div>
                  <label
                    htmlFor="login-confirm-password"
                    className="block text-xs font-semibold text-slate-300 mb-1.5"
                  >
                    {t('login.confirmPasswordLabel')}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder={t('login.passwordPlaceholder')}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3.5 py-2.5 font-mono text-sm text-white focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || checkingStatus}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 py-3 text-sm font-semibold text-white transition-colors cursor-pointer min-h-[48px]"
          >
            <span>
              {showSetupAdminForm
                ? t('login.setupAdminSubmit')
                : !isAdminSelected && !pocketbaseEnabled
                  ? t('login.demoEnter')
                  : t('login.submit')}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
