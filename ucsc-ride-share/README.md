🐌 Slug Rider
A Driver-First Carpooling Platform for UC Santa Cruz.

Slug Rider is a peer-to-peer commuting app designed specifically to solve the transportation bottleneck at UCSC. Unlike Uber or Lyft, where the driver goes to the passenger, Slug Rider optimizes for the driver's existing commute.

🎯 The Core Philosophy (The "Non-Obvious" Part)
The biggest friction in casual carpooling is the "Detour Anxiety"—drivers don't want to add 15 minutes to their commute just to pick someone up.

Slug Rider flips the script:

The Driver is the Anchor: The driver sets their start point and destination. Their route is fixed.

The Rider Commutes to the Commute: The app calculates the optimal point along the driver's path. The rider must walk to that point.

Minimal Deviation: The system ensures that any necessary detour for the driver is less than 2-3 minutes (e.g., pulling into a specific curb or bus stop), or ideally zero minutes.

📱 User Experience & Layout
For Riders
The Rider interface is designed for quick decision-making based on walking distance and arrival time.

Split-Screen Layout:

Left Panel: A scrollable list of available rides. Each ride card displays the driver's name, arrival time, and the "Walking Distance" required to meet them.

Right Panel: Interactive Google Map. When a ride is clicked, the map renders:

The Driver's Route (Blue Polyline).

The Rider's Location (Red Marker).

The Calculated Intercept Point (Green Marker).

A dashed line showing the walking path to the intercept point.

For Drivers
The Driver interface mimics a standard navigation app but with "Smart Waypoints."

Navigation View: Drivers see a standard Google Maps interface.

Automated Stops: When a rider books a seat, their pickup location is automatically injected as a waypoint into the current route.

Fixed Destinations: To simplify logistics, all rides must end at one of three major campus hubs:

Core West

West Remote

East Remote

🛠 Tech Stack
Frontend: React.js (Vite)

Backend: Express.js (Node.js)

Database: Supabase (PostgreSQL)

Maps & Routing: Google Maps JavaScript API (Directions Service, Geometry Library)

Authentication: Supabase Auth (Restricted to @ucsc.edu emails)

🗄 Database Schema (Simplified)
We use a relational schema optimized for geospatial path matching.

Users: Stores profile info and preferences (Age, Gender, Quiet Ride, etc.).

Trips: Stores the driver's Encoded Polyline (the route geometry) and the fixed destination.

Bookings: Stores the specific Lat/Lng intersection point where the rider agreed to meet the driver.

🚀 Getting Started
Prerequisites
Node.js (v18+)

A Google Cloud API Key (with Maps JS, Directions, and Geometry APIs enabled)

A Supabase Project URL & Anon Key

Installation
Clone the repo

Bash

git clone https://github.com/yourusername/slug-rider.git
cd slug-rider
Install Dependencies

Bash

# Client
cd client
npm install

# Server
cd ../server
npm install
Environment Variables Create a .env file in both client and server directories:

Code snippet

# Client .env
VITE_GOOGLE_MAPS_API_KEY=your_key_here
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key

# Server .env
SUPABASE_SERVICE_ROLE_KEY=your_secret_key
Run the App

Bash

# Run Client (Port 5173)
cd client && npm run dev

# Run Server (Port 3000)
cd server && npm start