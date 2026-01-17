import { Routes, Route } from 'react-router-dom';
import Landing from './Landing';
import SignUp from './SignUp';
import Login from './Login';
import DriverNavigationPage from './DriverNavigationPage';
import RiderPage from './RiderPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      <Route path="/driver" element={<DriverNavigationPage />} />
      <Route path="/rider" element={<RiderPage />} />
    </Routes>
  );
}

export default App;
