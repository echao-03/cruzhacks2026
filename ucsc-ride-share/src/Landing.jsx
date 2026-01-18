import { Link } from 'react-router-dom';
import { PageFrame } from './components/ui';

function Landing() {
  return (
    <PageFrame>
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="w-full max-w-2xl text-center">
          <div className="space-y-6">
            <div className="space-y-3">
              <h1 className="text-6xl font-semibold text-[#3b3127] sm:text-6xl">
                SlugCruise
              </h1>
              <p className="text-base text-[#5a4e41] sm:text-lg">
                Drive a Slug, by a Slug
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/signup"
                className="rounded-full border border-[#6a5a48] px-5 py-2 text-sm font-semibold text-[#5b4b3a] transition hover:bg-[#efe5d8]"
              >
                Sign In
              </Link>
              <Link
                to="/login"
                className="rounded-full bg-[#5b6a54] px-5 py-2 text-sm font-semibold text-[#f3efe6] transition hover:bg-[#4b5a45]"
              >
                Log In
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

export default Landing;
