# 🚀 TaktX Console - Quick Start Guide

## Prerequisites

✅ All dependencies installed (`npm install` completed)  
✅ Backend running on `http://localhost:8084`  
✅ At least one process definition deployed to TaktX  

---

## Start the Application

### Option 1: Using the Quick Start Script (Recommended)

```bash
./start.sh
```

This script will:
1. Check if the backend is running
2. Start the Next.js dev server
3. Open the console on `http://localhost:3001`

### Option 2: Manual Start

```bash
npm run dev
```

---

## Testing the Process Definition Viewer

### Step 1: Navigate to Runway

Open your browser to: **http://localhost:3001/runway**

### Step 2: Select a Process Definition

1. Click the **"Process Definition ID"** dropdown
2. You should see a list of deployed process definitions
3. Select one (e.g., "OrderProcess")

### Step 3: Select a Version

1. The **"Version"** dropdown will auto-populate
2. The latest version will be auto-selected
3. You can change to a different version if available

### Step 4: View the BPMN Diagram

- The BPMN diagram will automatically render
- It will auto-zoom to fit the viewport
- You can pan and zoom the diagram as needed

---

## Troubleshooting

### Backend Not Running?

**Error:** "Failed to load process definitions"

**Solution:** Start the backend first:

```bash
cd ../../backend
./gradlew :ingesters:inmemory:quarkusDev
```

Wait for it to show "Listening on: http://localhost:8084"

### CORS Issues?

**Error:** "CORS policy blocked" in browser console

**Solution:** Add to backend `application.properties`:

```properties
quarkus.http.cors=true
quarkus.http.cors.origins=http://localhost:3000
```

### No Process Definitions Showing?

**Error:** Empty dropdown for process definitions

**Possible causes:**
1. Backend not running
2. No process definitions deployed to TaktX
3. Backend on different port

**Solution:** 
- Check backend is accessible at `http://localhost:8084/processdefinitions`
- Deploy a process definition using TaktX client
- Check `.env.local` if using custom backend URL

### Port 3000 Already in Use?

**Error:** "Port 3000 is already in use"

**Solution:** Use a different port:

```bash
PORT=3001 npm run dev
```

### BPMN Diagram Not Rendering?

**Error:** Diagram area shows empty or error

**Possible causes:**
1. BPMN XML is invalid
2. Network error fetching XML
3. bpmn-js initialization error

**Solution:**
- Check browser console for errors
- Verify the process definition has valid BPMN XML
- Check network tab to see if XML endpoint returns data

---

## Build for Production

### Build the application:

```bash
npm run build
```

### Start production server:

```bash
npm run start
```

Production server runs on `http://localhost:3000`

---

## Environment Variables

Create `.env.local` if you need custom configuration:

```env
# Backend URL (default: http://localhost:8084)
NEXT_PUBLIC_TAKTX_BACKEND_URL=http://localhost:8084

# WebSocket URL (for future use)
NEXT_PUBLIC_TAKTX_WS_URL=ws://localhost:8084/ws
```

---

## Available Pages

- **/** - Home page with navigation cards
- **/runway** - Process definition viewer (main feature)

---

## Next Steps

### Deploy a Test Process Definition

If you don't have any process definitions yet, deploy one using TaktX client:

```java
// Example deployment code
ProcessDefinitionDTO definition = // ... load BPMN
taktxClient.getProcessDefinitionConsumer().deployProcessDefinition(definition);
```

### Verify Backend Endpoints

Test the endpoints directly:

```bash
# Get all process definition IDs
curl http://localhost:8084/processdefinitions

# Get versions for a specific ID
curl http://localhost:8084/processdefinitions?id=OrderProcess

# Get BPMN XML for a specific version
curl http://localhost:8084/processdefinitions/OrderProcess/version/1/xml
```

---

## Development Tips

### Hot Reload

The dev server supports hot reload. Changes to code will automatically refresh the browser.

### TypeScript Checking

Run TypeScript type checking:

```bash
npx tsc --noEmit
```

### Linting

Run ESLint:

```bash
npm run lint
```

### Clear Next.js Cache

If you encounter strange issues:

```bash
rm -rf .next
npm run dev
```

---

## Success Checklist

- [ ] Backend running on port 8084
- [ ] Frontend running on port 3000
- [ ] Can navigate to http://localhost:3000
- [ ] Can navigate to http://localhost:3000/runway
- [ ] Process definitions dropdown loads
- [ ] Can select a process definition
- [ ] Versions dropdown populates
- [ ] BPMN diagram renders
- [ ] No errors in browser console

---

## 🎉 You're Ready!

If all the above works, your TaktX Console is fully operational!

**Happy Monitoring!** 🚀

