import React from 'react';
import { User } from 'firebase/auth';
import { LogOut, Cloud, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface AuthBarProps {
  user: User | null;
  needsAuth: boolean;
  isLoggingIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

export default function AuthBar({ user, needsAuth, isLoggingIn, onLogin, onLogout }: AuthBarProps) {
  return (
    <div id="auth-bar" className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 mb-6 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
          <Cloud className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-display font-semibold text-slate-800 text-sm">סנכרון Google Drive</h3>
          <p className="text-xs text-slate-500">
            {user 
              ? "מחובר בהצלחה. מאמרים יישמרו ישירות בחשבון ה-Google Drive שלך" 
              : "התחבר כדי לשמור ולסנכרן את המאמרים שלך ישירות לחשבון הדרייב האישי"
            }
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-3 bg-slate-50 pl-3 pr-1 py-1 rounded-full border border-slate-100">
            {user.photoURL && (
              <img 
                src={user.photoURL} 
                alt={user.displayName || 'משתמש'} 
                className="w-8 h-8 rounded-full border border-slate-200" 
                referrerPolicy="no-referrer"
              />
            )}
            <div className="flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-700 leading-tight">{user.displayName || 'משתמש גוגל'}</span>
              <span className="text-[10px] text-slate-400 font-mono leading-none">{user.email}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium mr-2">
              <CheckCircle2 className="w-3 h-3" />
              מחובר
            </div>
            <button 
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors mr-1"
              title="להתנתק"
              id="btn-logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button 
            onClick={onLogin}
            disabled={isLoggingIn}
            id="btn-google-signin"
            className="gsi-material-button w-full sm:w-auto relative flex items-center justify-center bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-sans text-sm font-medium px-4 py-2.5 rounded-xl cursor-pointer select-none transition-all duration-200 hover:shadow-sm active:bg-slate-100"
          >
            <div className="gsi-material-button-state"></div>
            <div className="gsi-material-button-content-wrapper flex items-center gap-3">
              <div className="gsi-material-button-icon flex items-center justify-center">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block', width: '20px', height: '20px' }}>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              <span className="gsi-material-button-contents font-semibold">
                {isLoggingIn ? 'מתחבר...' : 'התחבר עם Google'}
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
