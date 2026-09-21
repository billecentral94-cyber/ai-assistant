from curl_cffi import requests
import json
import time

def test_nse():
    s = requests.Session(impersonate="chrome120")
    
    # 1. Base navigation headers for warming up
    doc_headers = {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
    }
    
    print("1. Visiting Homepage...")
    r1 = s.get("https://www.nseindia.com", headers=doc_headers, timeout=15)
    print("Homepage status:", r1.status_code, "Cookies:", len(s.cookies))
    time.sleep(1)

    print("2. Visiting Option Chain HTML Page...")
    doc_headers['sec-fetch-site'] = 'same-origin'
    doc_headers['referer'] = 'https://www.nseindia.com/'
    r2 = s.get("https://www.nseindia.com/option-chain", headers=doc_headers, timeout=15)
    print("Option chain page status:", r2.status_code, "Cookies:", len(s.cookies))
    time.sleep(1)

    # 3. API request headers (XHR / CORS)
    api_headers = {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'referer': 'https://www.nseindia.com/option-chain',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'priority': 'u=1, i',
    }

    for sym in ["NIFTY", "BANKNIFTY"]:
        url = f"https://www.nseindia.com/api/option-chain-indices?symbol={sym}"
        print(f"3. Fetching {sym} option chain from {url}...")
        r_api = s.get(url, headers=api_headers, timeout=15)
        print(f"{sym} status: {r_api.status_code}")
        if r_api.status_code == 200:
            data = r_api.json()
            records = data.get("records", {})
            print(f" -> Spot Price: {records.get('underlyingValue')}")
            print(f" -> Expiries: {records.get('expiryDates', [])[:3]}")
            print(f" -> Total Strike Rows: {len(records.get('data', []))}")
        else:
            print(f" -> Error text: {r_api.text[:200]}")
        time.sleep(1)

if __name__ == "__main__":
    test_nse()
