import React from 'react';
import ExcelGenerator from './ExcelGenerator';

function App() {
  return (
    <div className="App">
      {/* No more Router, Home, or SemesterSelect */}
      <ExcelGenerator />
    </div>
  );
}

export default App;