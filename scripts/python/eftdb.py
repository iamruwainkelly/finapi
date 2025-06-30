"""
cloudscraper is amazing. bypasses Cloudflare's anti-bot page.
this script pull 25 records per page from etfdb.com.
"""

import cloudscraper

# Create a CloudScraper instance
scraper = cloudscraper.create_scraper()


url = "https://etfdb.com/data_set/?tm=92882&no_null_sort=true&count_by_id=&sort=symbol&order=asc&offset=0"

url = "https://www.investing.com/indices/switzerland-20"

# Use it like a regular requests session
response = scraper.get(url)
# print(response.text)



# date the URL for the file name
from datetime import datetime
date_str = datetime.now().strftime("%Y-%m-%d")
urlname = url.split("/")[-2]  # Get the second last part of the URL

#log the URL name
print(f"Saving response to {urlname}.html")

# save the response to a file
with open(f"{urlname}_{date_str}.html", "w", encoding="utf-8") as file:
    file.write(response.text)