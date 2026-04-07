import { ArrowRight, Check, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';

const benefits = [
  'No backend setup',
  'Built-in auth',
  'API keys ready',
  'Rate limiting included',
  'Scales with you',
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.18),_transparent_28%),linear-gradient(180deg,_#140c08_0%,_#1b110c_42%,_#0e0907_100%)] text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-orange-400/60 bg-orange-500 text-sm font-bold text-[#1f1108] shadow-[0_12px_30px_rgba(249,115,22,0.35)]">B</div>
          <div>
            <div className="text-sm font-semibold tracking-[0.24em] text-orange-200">BACKFORGE</div>
            <div className="text-xs text-orange-100/70">Backend-as-a-Service for SaaS builders</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" asChild>
            <Link to="/login">Login</Link>
          </Button>
          <Button asChild>
            <Link to="/register">Start for free</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-20 pt-8">
        <section className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
          <div className="space-y-7">
            <div className="inline-flex items-center rounded-full border border-orange-400/35 bg-orange-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-orange-200 shadow-sm">
              Launch Today
            </div>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight text-orange-50 text-balance">
                Build your backend in seconds.
                <br />
                No setup. No complexity.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-orange-100/80">
                Auth, database, API keys and scaling - ready instantly.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Button size="lg" asChild>
                <Link to="/register">
                  Start for free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/login">Open dashboard</Link>
              </Button>
            </div>

            <Card className="border-orange-400/35 bg-[#130c09] text-orange-50 shadow-[0_24px_60px_rgba(0,0,0,0.38)]">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-orange-300/80">
                  <Terminal className="h-4 w-4 text-orange-400" />
                  Live Demo
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all text-sm leading-7">
                  <code>curl -H "x-api-key: YOUR_KEY" http://localhost:3000/public/sample_items</code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden border-orange-400/35 bg-[#1a110d]/95 shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-200/80">Why developers choose BACKFORGE</div>
                <div className="text-3xl font-semibold tracking-tight text-orange-50">Everything boring is already done.</div>
                <p className="text-base leading-7 text-orange-100/72">
                  Create an account, get a project, copy your API key, and hit a live endpoint immediately.
                </p>
              </div>

              <div className="grid gap-3">
                {benefits.map((benefit) => (
                  <div key={benefit} className="flex items-center gap-3 rounded-2xl border border-orange-400/25 bg-orange-500/8 px-4 py-4 text-sm font-medium text-orange-50">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/18 text-orange-300">
                      <Check className="h-4 w-4" />
                    </div>
                    {benefit}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="rounded-[2rem] border border-orange-400/30 bg-[#17100c]/95 p-8 shadow-[0_22px_54px_rgba(0,0,0,0.36)]">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-200/80">Social Proof</p>
              <h2 className="text-3xl font-semibold tracking-tight text-orange-50">Built by developers, for developers.</h2>
              <p className="max-w-2xl text-base leading-7 text-orange-100/72">
                BACKFORGE is designed for Node.js and SaaS builders who want to stop rebuilding auth, project setup, API keys and rate limits from scratch.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-orange-100/78">
              <div className="rounded-2xl border border-orange-400/25 bg-orange-500/8 px-4 py-4">Create your account and receive a starter project automatically.</div>
              <div className="rounded-2xl border border-orange-400/25 bg-orange-500/8 px-4 py-4">Copy the API key and test the endpoint in under a minute.</div>
              <div className="rounded-2xl border border-orange-400/25 bg-orange-500/8 px-4 py-4">Launch now, learn from real developers, and iterate from real usage.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
