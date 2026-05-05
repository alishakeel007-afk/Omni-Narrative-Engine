const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('dev.db');

db.serialize(() => {
  console.log("Inserting test user directly into SQLite...");
  
  const id = "test-id-12345";
  const name = "Direct Backend Test";
  const email = "directtest@example.com";
  const passwordHash = "$2a$10$xyzFakeHashedPasswordXYZ1234567890";
  const now = new Date().toISOString();

  const stmt = db.prepare("INSERT INTO User (id, name, email, passwordHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)");
  stmt.run(id, name, email, passwordHash, now, now, function(err) {
    if (err) {
      console.error("Insert error:", err.message);
      return;
    }
    console.log("Inserted user successfully!");
    
    console.log("\nReading users from database:");
    db.each("SELECT id, name, email, passwordHash FROM User", (err, row) => {
      console.log(`- ${row.name} (${row.email}) | Hash: ${row.passwordHash}`);
    }, () => {
      console.log("\nDone! Please click the 'Refresh' button in DB Browser to see the new data.");
      db.close();
    });
  });
});
