import sys
import os
import time
from playwright.sync_api import sync_playwright

def verify():
    print("Launching Playwright...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Capture console messages
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        print("Navigating to local development server...")
        try:
            page.goto('http://localhost:5173', timeout=10000)
            page.wait_for_load_state('networkidle')
        except Exception as e:
            print(f"Error navigating to http://localhost:5173: {e}")
            browser.close()
            return False

        print("Page loaded successfully. Attempting to log in as Renata Cruz...")
        try:
            # Check if we are already logged in or need to log in
            if page.locator("input[type='email']").is_visible():
                page.fill("input[type='email']", "admin@mkb.ph")
                page.fill("input[type='password']", "Admin1234")
                page.click("button[type='submit']")
                
                # Wait for main dashboard to load
                page.wait_for_selector("text=total users", timeout=8000)
                print("Logged in successfully!")
            else:
                print("Already logged in or bypassed login screen.")
        except Exception as e:
            print(f"Login failed: {e}")
            page.screenshot(path="C:\\Users\\NaphierNODE\\.gemini\\antigravity-ide\\brain\\fb762921-ec38-45ba-b71f-0c864a689720\\login_failure.png")
            print("Console Errors:")
            for err in console_errors:
                print(f" - {err}")
            browser.close()
            return False

        print("Navigating to the 'Reports' page...")
        try:
            # Click the Reports item in the Sidebar
            reports_tab = page.locator("text=Reports")
            reports_tab.first.click()
            
            # Wait for any animation and components to load
            time.sleep(3)
            
            # Take a high-fidelity verification screenshot
            dest_screenshot = "C:\\Users\\NaphierNODE\\.gemini\\antigravity-ide\\brain\\fb762921-ec38-45ba-b71f-0c864a689720\\reports_rendering_verification.png"
            page.screenshot(path=dest_screenshot, full_page=True)
            print(f"Screenshot successfully saved to: {dest_screenshot}")
        except Exception as e:
            print(f"Failed to navigate or capture reports screenshot: {e}")

        print("Console Errors collected during session:")
        if console_errors:
            for err in console_errors:
                print(f" [ERROR] - {err}")
        else:
            print(" [SUCCESS] - No runtime console errors found!")

        browser.close()
        return True

if __name__ == "__main__":
    verify()
