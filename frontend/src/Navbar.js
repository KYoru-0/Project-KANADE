import React from 'react';
import logo from './assets/icons/256.png';
import userIcon from './assets/icons/user.svg';
import './Navbar.css';

function Navbar() {
  return (
    <header className="navbar">
      <div className="navbar-container">
        <a href="/" className="navbar-brand">
          <div className="logo-container">
            <img src={logo} alt="Project:KANADE Logo" className="navbar-logo" />
          </div>
          <span className="brand-text">
            <span className="brand-prefix">Project:</span>
            <span className="brand-accent">KANADE</span>
          </span>
        </a>

        <div className="navbar-user">
          <div className="user-tooltip-wrapper">
            <button className="user-profile-btn" aria-label="User profile">
              <span className="user-avatar-circle">
                <img src={userIcon} alt="User profile" className="user-icon" />
              </span>
              <span className="user-name">KYoru</span>
            </button>
            <div className="user-tooltip" role="tooltip">
              This is a fake button for now!
              <br></br>
              Later people will be able to log in and share their own playlist!
              <br></br>
              Please standby!!
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
