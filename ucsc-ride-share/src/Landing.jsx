import { Link } from 'react-router-dom';

function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 align-content">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">SlugCruise</h1>
      <div className="space-x-4">
        <Link to="/signup">
          <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            Sign In
          </button>
        </Link>
        <Link to="/login">
          <button className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
            Log In
          </button>
        </Link>
      </div>
    </div>
  );
}

export default Landing;