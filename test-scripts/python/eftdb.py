import cloudscraper

# Create a CloudScraper instance
scraper = cloudscraper.create_scraper()

# Use it like a regular requests session
response = scraper.get("https://etfdb.com/data_set/?tm=92882&no_null_sort=true&count_by_id=&sort=symbol&order=asc&offset=0")
# print(response.text)




# save the response to a file
with open("response.html", "w", encoding="utf-8") as file:
    file.write(response.text)