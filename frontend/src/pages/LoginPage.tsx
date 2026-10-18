import { useState } from 'react';
import { useAuth } from '../auth';

const demoAccounts = [
  { email: 'alice@newtonite.com', role: 'Operations Admin', mark: 'A' },
  { email: 'bob@newtonite.com', role: 'Operations Lead', mark: 'B' },
  { email: 'carol@newtonite.com', role: 'Operations Member', mark: 'C' },
  { email: 'dave@newtonite.com', role: 'Operations Viewer', mark: 'D' },
];

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (error) {
      const requestError = error as Error & { status?: number };
      if (requestError.status === 401) {
        setError('We could not verify those credentials. Choose a demo account below or check your password.');
      } else if (requestError.status) {
        setError('The workspace service is unavailable right now. Please try again in a moment.');
      } else {
        setError('We could not reach the workspace service. Start the API, then try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const chooseDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError('');
  };

  return (
    <main className="min-h-dvh bg-[#c8f079] p-3 sm:p-6 lg:h-dvh lg:overflow-hidden lg:p-9">
      <div className="ops-shell-shadow ops-grid mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-[1320px] overflow-hidden rounded-[2rem] border-[10px] border-[#202b27] bg-[#bde86c] lg:h-[calc(100dvh-4.5rem)] lg:min-h-0 lg:grid-cols-[1.18fr_0.82fr] lg:rounded-[2.7rem]">
        <section className="relative hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="relative z-10 flex items-center gap-3 text-[#202b27]">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#202b27] text-lg font-black text-[#c7f36a] shadow-[0_4px_0_#8fba39]">N</span>
            <div>
              <p className="text-xl font-extrabold tracking-tight">Newtonite Ops</p>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#53703d]">Operations workspace</p>
            </div>
          </div>

          <div className="relative z-10 max-w-lg">
            <span className="mb-5 inline-flex rounded-full border border-[#5a8139]/30 bg-[#e8f8bc]/70 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#4a6a32]">Keep operations moving</span>
            <h1 className="text-5xl font-black leading-[0.98] tracking-[-0.06em] text-[#1d2824]">Your calm corner for high-pressure work.</h1>
            <p className="mt-5 max-w-md text-sm font-medium leading-6 text-[#526443]">Create, coordinate, approve, and resolve every important operational task in one considered workspace.</p>
          </div>

          <div className="relative z-10 grid max-w-md grid-cols-3 gap-3">
            <Metric label="Team scope" value="03" />
            <Metric label="Role-aware" value="100%" />
            <Metric label="Audit trail" value="On" />
          </div>

          <div className="absolute -bottom-16 -right-10 h-80 w-80 rounded-full bg-[#f7d65b]/80 blur-[1px]" />
          <div className="absolute bottom-12 right-16 h-44 w-44 rounded-full border-[18px] border-[#ff806d]/80 bg-[#f9a593]/35" />
          <div className="absolute right-12 top-12 h-20 w-20 rounded-3xl bg-[#fffce8]/80 shadow-[0_14px_25px_rgb(44_70_34_/_18%)]" />
          <div className="absolute bottom-20 right-36 h-28 w-28 rounded-[2rem] bg-[#2b3932] shadow-[0_15px_30px_rgb(23_35_28_/_20%)]" />
        </section>

        <section className="flex min-h-[calc(100dvh-1.5rem)] items-center justify-center bg-[#fffefa] p-5 sm:p-10 lg:min-h-0 lg:items-start lg:overflow-y-auto lg:overscroll-contain lg:p-12">
          <div className="w-full max-w-[370px] lg:my-auto lg:py-8">
            <div className="mb-8 lg:hidden">
              <div className="mb-6 flex items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#202b27] font-black text-[#c7f36a]">N</span>
                <span className="font-extrabold tracking-tight text-[#202b27]">Newtonite Ops</span>
              </div>
            </div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#8b958d]">Welcome back</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[#202b27]">Sign in to your workspace.</h2>
            <p className="mt-3 text-sm leading-6 text-[#778078]">Use one of the demo identities to explore the complete operations workflow.</p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <label>
                <span className="ops-label">Email address</span>
                <input className="ops-input text-sm" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@newtonite.com" required />
              </label>
              <label>
                <span className="ops-label">Password</span>
                <input className="ops-input text-sm" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" required />
              </label>

              {error && <div role="alert" className="rounded-xl border border-[#f6b4a7] bg-[#fff0ec] px-3 py-2.5 text-xs font-semibold text-[#ad463a]">{error}</div>}

              <button type="submit" disabled={loading} className="ops-primary-button ops-lime-button w-full py-3 text-sm">
                {loading ? 'Opening workspace...' : 'Enter workspace'} <span aria-hidden="true">→</span>
              </button>
            </form>

            <div className="my-7 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a2a8a2]"><span className="h-px flex-1 bg-[#e6e6df]" />Demo access<span className="h-px flex-1 bg-[#e6e6df]" /></div>

            <div className="space-y-2">
              {demoAccounts.map((account) => (
                <button key={account.email} type="button" onClick={() => chooseDemo(account.email)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${email === account.email ? 'border-[#a9d84d] bg-[#f5fce3]' : 'border-[#edede7] bg-white hover:border-[#cbe990] hover:bg-[#fcfff4]'}`}>
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e5f4c5] text-[11px] font-black text-[#30402f]">{account.mark}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-extrabold text-[#35413b]">{account.email}</span><span className="block text-[10px] font-medium text-[#879088]">{account.role}</span></span>
                  <span className="text-xs text-[#8fbe39]">↗</span>
                </button>
              ))}
            </div>
            <p className="mt-5 text-center text-[11px] font-medium text-[#99a099]">Demo password: <span className="font-bold text-[#59645e]">password123</span></p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#608747]/20 bg-[#ecf8cb]/65 p-3">
      <p className="text-xl font-black tracking-[-0.04em] text-[#202b27]">{value}</p>
      <p className="mt-0.5 text-[10px] font-extrabold uppercase tracking-[0.09em] text-[#587141]">{label}</p>
    </div>
  );
}
