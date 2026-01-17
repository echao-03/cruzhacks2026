import { Link } from 'react-router-dom';
import { GlassCard, PageFrame, PageHeader } from './components/ui';

function Landing() {
  return (
    <PageFrame>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.7fr)] lg:items-center">
        <div className="space-y-6">
          <PageHeader
            title="Carpooling, calm and coordinated."
            subtitle="Preview driver and rider maps while we finish the flow."
          />
          <div className="flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="rounded-full border border-[#4d4135] px-5 py-2 text-sm font-semibold text-[#4d4135] transition hover:bg-[#4d4135] hover:text-[#f5efe6]"
            >
              Sign In
            </Link>
            <Link
              to="/login"
              className="rounded-full bg-[#6e5a46] px-5 py-2 text-sm font-semibold text-[#f7f0e6] transition hover:bg-[#5c4a39]"
            >
              Log In
            </Link>
          </div>
        </div>

        <GlassCard className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6f604f]">
              Quick previews
            </p>
            <h2 className="text-xl font-semibold text-[#3d342a]">
              Jump to maps
            </h2>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              to="/driver-demo"
              className="rounded-2xl bg-[#4f5b4a] px-4 py-3 text-sm font-semibold text-[#f3efe6] shadow-[0_10px_20px_rgba(65,80,63,0.3)] transition hover:translate-y-[-1px] hover:bg-[#434d3d]"
            >
              Skip to Driver
            </Link>
            <Link
              to="/rider-demo"
              className="rounded-2xl border border-[#6a5a48] px-4 py-3 text-sm font-semibold text-[#5b4b3a] transition hover:bg-[#efe5d8]"
            >
              Skip to Rider
            </Link>
          </div>
        </GlassCard>
      </div>
    </PageFrame>
  );
}

export default Landing;
