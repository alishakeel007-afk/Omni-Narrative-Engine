import sqlite3
import bcrypt
import uuid
import datetime

db_path = "dev.db"

def test_db():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    email = "backendtest@example.com"
    password = "SecurePassword123!"
    
    # Hash password (like the backend would)
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    user_id = str(uuid.uuid4())
    now = datetime.datetime.now().isoformat()
    
    # Insert user
    print(f"Inserting user {email} into dev.db...")
    cursor.execute("""
        INSERT INTO User (id, name, email, passwordHash, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user_id, "Backend Test", email, hashed, now, now))
    
    conn.commit()
    print("User successfully inserted!\n")
    
    # Fetch all users
    print("Fetching all users from dev.db...")
    cursor.execute("SELECT id, name, email, passwordHash FROM User")
    users = cursor.fetchall()
    
    print("\n--- DATABASE ROWS ---")
    for row in users:
        print(f"ID: {row[0]}")
        print(f"Name: {row[1]}")
        print(f"Email: {row[2]}")
        print(f"Hashed Password: {row[3]}")
        print("---------------------\n")
        
    conn.close()

if __name__ == "__main__":
    test_db()
