import React from 'react';
import Navbar from './Navbar';
import SongList from './SongList';
import './App.css';

function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="main-content">
        <SongList />
      </main>
    </div>
  );
}

export default App;
