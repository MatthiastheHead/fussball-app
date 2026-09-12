import React from 'react';

export default function SquadBrand({ compact = false }) {
  return <div className={`squad-brand${compact ? ' compact' : ''}`}>
    <img src="/brand/squadhq-logo.png" alt="SquadHQ: Fußball und Teamorganisation" width="128" height="128" />
    <h1>Squad<span>HQ</span></h1>
    <p>Dein Team. Deine Organisation. Dein SquadHQ.</p>
  </div>;
}
