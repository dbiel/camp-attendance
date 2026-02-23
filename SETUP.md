# Camp Attendance Tracker - Firebase Setup Guide

Everything runs through one Google account. Total setup time: ~15 minutes.

---

## Step 1: Create a Firebase Project (3 minutes)

1. Go to https://console.firebase.google.com
2. Click **Add project**
3. Name it something like "camp-attendance"
4. You can disable Google Analytics (not needed) and click **Create Project**
5. Wait for it to finish, then click **Continue**

---

## Step 2: Enable Firestore Database (2 minutes)

1. In your Firebase project, click **Build** > **Firestore Database** in the left sidebar
2. Click **Create database**
3. Choose **Start in test mode** (we'll set rules later)
4. Pick a location close to you (e.g., us-central for US)
5. Click **Enable**

---

## Step 3: Register a Web App (2 minutes)

1. In your Firebase project, click the **gear icon** (Settings) > **Project settings**
2. Scroll down to **Your apps** and click the **web icon** (</>)
3. Give it a nickname like "camp-attendance-web"
4. Check **Also set up Firebase Hosting**
5. Click **Register app**
6. You'll see a config block like this — **copy these values**:
   ```
   apiKey: "AIza...",
   authDomain: "camp-attendance-xxxxx.firebaseapp.com",
   projectId: "camp-attendance-xxxxx",
   storageBucket: "camp-attendance-xxxxx.appspot.com",
   messagingSenderId: "123456789",
   appId: "1:123456789:web:abcdef"
   ```
7. Click through the remaining steps

---

## Step 4: Set Up the Code on Your Computer (5 minutes)

### Install Node.js (if you don't have it)
Download from https://nodejs.org (pick the LTS version)

### Install Firebase CLI
Open a terminal/command prompt and run:
```
npm install -g firebase-tools
```

### Set Up the Project
1. Unzip this project folder somewhere on your computer
2. Open a terminal in the project folder
3. Create a file called `.env.local` with your Firebase config:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=camp-attendance-xxxxx.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=camp-attendance-xxxxx
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=camp-attendance-xxxxx.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
   NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
   NEXT_PUBLIC_ADMIN_PASSWORD=your-secret-password-here
   ```
4. Edit `.firebaserc` and replace `YOUR-PROJECT-ID` with your actual Firebase project ID
5. Run these commands:
   ```
   npm install
   firebase login
   ```

### Test Locally
```
npm run dev
```
Open http://localhost:3000 — you should see the teacher selection page.

---

## Step 5: Deploy to the Web (2 minutes)

Run these commands from the project folder:
```
npm run build
firebase deploy
```

Firebase will give you a URL like:
```
https://camp-attendance-xxxxx.web.app
```

**That's the link you share with all your teachers!** It works on phones, tablets, and computers.

---

## Step 6: Upload Your Data

1. Go to your deployed URL
2. Click **Admin Dashboard** at the bottom
3. Enter your admin password
4. Click **Upload Data**
5. Upload CSV files **in this order**:

### teachers.csv
```
name,email
Jane Smith,jane@camp.com
John Doe,john@camp.com
```

### students.csv
```
name,age,dorm_room,parent_name,parent_phone,parent_email,medical_notes
Emma Johnson,12,Cabin A,Sarah Johnson,555-0101,sarah@email.com,Peanut allergy
Liam Williams,11,Cabin B,Mike Williams,555-0102,mike@email.com,
```
Any extra columns (like shirt_size, bus_number, etc.) are automatically saved!

### classes.csv
```
name,teacher_name,period,start_time,end_time,location
Swimming,Jane Smith,1,09:00,10:00,Lake
Arts & Crafts,John Doe,2,10:15,11:15,Rec Hall
```

### enrollments.csv
```
student_name,class_name
Emma Johnson,Swimming
Emma Johnson,Arts & Crafts
Liam Williams,Swimming
```

---

## How It Works

### For Teachers
1. Open the link on their phone or laptop
2. Search for and tap their name
3. See all their classes with attendance progress
4. Tap a class → tap each student's status button to toggle Present/Absent
5. If a student arrives late (after class start time), marking them present automatically marks them **Tardy**
6. Use "Mark All Unmarked as Absent" to quickly finish up

### For You (Admin)
1. Click "Admin Dashboard" and enter your password
2. See all absences and tardies for any date
3. Filter by class, dorm room, or search by student name
4. Click any student name to see their full profile: dorm, parents, medical notes, today's full schedule

---

## Making Updates

After any code changes:
```
npm run build
firebase deploy
```

Common things to change:
- **Admin password**: Update `NEXT_PUBLIC_ADMIN_PASSWORD` in `.env.local`, rebuild, redeploy
- **Colors/branding**: Edit the Tailwind classes in the page files
- **New features**: Ask Claude to modify the code!

---

## Cost

Firebase Spark plan (free) includes:
- 1 GB Firestore storage
- 50K reads/day, 20K writes/day
- 10 GB hosting bandwidth/month

This is more than enough for a summer camp with 700 students. You'd have to take attendance for the entire camp about 70 times in a single day to hit the read limit.
