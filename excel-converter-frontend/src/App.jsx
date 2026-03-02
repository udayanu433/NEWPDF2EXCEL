import React, { useEffect } from 'react';
import ExcelGenerator from './ExcelGenerator';

function App() {
  useEffect(() => {
    document.title = 'PDF2Sheets';
  }, []);

  return (
    <div className="App">
      {/* No more Router, Home, or SemesterSelect */}
      <ExcelGenerator />
    </div>
  );
}

export default App;