#!/usr/bin/env python3
"""
Extract unique independent restaurants (appearing in only one airport)
along with the full airport name they appear in.
Excludes known chains even when they appear with location suffixes
e.g. "Starbucks - Gate 332", "KFC Kentucky Fried Chicken".

Outputs:
  independents.csv   — name, cuisine, airport_code, airport_name
"""

import csv
import os
import re
from collections import defaultdict, Counter

import os as _os
_SCRIPT_DIR     = _os.path.dirname(_os.path.abspath(__file__))
_TOOLS_DIR      = _os.path.join(_SCRIPT_DIR, '..', '..')
RESTAURANTS_DIR = _os.path.join(_TOOLS_DIR, 'data', 'restaurants')
JSONS_DIR       = _os.path.join(_TOOLS_DIR, 'data', 'restaurants', 'jsons')
HELPER_DIR      = _os.path.join(_TOOLS_DIR, 'data', 'helper_data')
IMAGES_DIR      = _os.path.join(_TOOLS_DIR, 'airport_images')


CSV_DIR = RESTAURANTS_DIR

AIRPORT_CSVS = {
    "LGW": ("gatwick_restaurants.csv",   "London Gatwick"),
    "LHR": ("heathrow_restaurants.csv",  "London Heathrow"),
    "BHX": ("bhx_restaurants.csv",       "Birmingham Airport"),
    "MAN": ("man_restaurants.csv",       "Manchester Airport"),
    "CDG": ("cdg_restaurants.csv",       "Paris Charles de Gaulle"),
    "FRA": ("fra_restaurants.csv",       "Frankfurt Airport"),
    "HND": ("hnd_restaurants.csv",       "Tokyo Haneda"),
    "AUH": ("auh_restaurants.csv",       "Abu Dhabi International"),
    "DOH": ("doh_restaurants.csv",       "Doha Hamad International"),
    "IST": ("ist_restaurants.csv",       "Istanbul Airport"),
    "JFK": ("jfk_restaurants.csv",       "New York JFK"),
    "SIN": ("sin_restaurants.csv",       "Singapore Changi"),
    "LAX": ("lax_restaurants.csv",       "Los Angeles International"),
    "BKK": ("bkk_restaurants.csv",       "Bangkok Suvarnabhumi"),
    "DXB": ("dxb_restaurants.csv",       "Dubai International"),
    "PKX": ("pkx_restaurants.csv",       "Beijing Daxing"),
    "CAN": ("can_restaurants.csv",       "Guangzhou Baiyun"),
    "HKG": ("hkg_restaurants.csv",       "Hong Kong International"),
    "TPE": ("tpe_restaurants.csv",       "Taipei Taoyuan"),
    "ICN": ("icn_restaurants.csv",       "Seoul Incheon"),
    "NRT": ("nrt_restaurants.csv",       "Tokyo Narita"),
    "GIG": ("gig_restaurants.csv",       "Rio de Janeiro Galeão"),
    "LIM": ("lim_restaurants.csv",       "Lima Jorge Chávez"),
    "LOS": ("los_restaurants.csv",       "Lagos Murtala Muhammed"),
    "JNB": ("jnb_restaurants.csv",       "Johannesburg OR Tambo"),
    "WLG": ("wlg_restaurants.csv",       "Wellington Airport"),
    "SYD": ("syd_restaurants.csv",       "Sydney Kingsford Smith"),
    "MEL": ("mel_restaurants.csv",       "Melbourne Airport"),
    "KIX": ("kix_restaurants.csv",       "Osaka Kansai"),
    "KUL": ("kul_restaurants.csv",       "Kuala Lumpur International"),
    "MNL": ("mnl_restaurants.csv",       "Manila Ninoy Aquino"),
    "DEL": ("del_restaurants.csv",       "Delhi Indira Gandhi"),
    "BOM": ("bom_restaurants.csv",       "Mumbai Chhatrapati Shivaji"),
    "CMB": ("cmb_restaurants.csv",       "Colombo Bandaranaike"),
    "HAN": ("han_restaurants.csv",       "Hanoi Noi Bai"),
    "AMS": ("ams_restaurants.csv",       "Amsterdam Schiphol"),
    "ATH": ("ath_restaurants.csv",       "Athens Eleftherios Venizelos"),
    "ATL": ("atl_restaurants.csv",       "Atlanta Hartsfield-Jackson"),
    "DFW": ("dfw_restaurants.csv",       "Dallas Fort Worth"),
    "BOS": ("bos_restaurants.csv",       "Boston Logan"),
    "BRU": ("bru_restaurants.csv",       "Brussels Airport"),
    "DEN": ("den_restaurants.csv",       "Denver International"),
    "DUB": ("dub_restaurants.csv",       "Dublin Airport"),
    "FCO": ("fco_restaurants.csv",       "Rome Fiumicino"),
    "IAH": ("iah_restaurants.csv",       "Houston George Bush"),
    "LAS": ("las_restaurants.csv",       "Las Vegas Harry Reid"),
    "LGA": ("lga_restaurants.csv",       "New York LaGuardia"),
    "LIS": ("lis_restaurants.csv",       "Lisbon Humberto Delgado"),
    "MAD": ("mad_restaurants.csv",       "Madrid Barajas"),
    "MCO": ("mco_restaurants.csv",       "Orlando International"),
    "MEX": ("mex_restaurants.csv",       "Mexico City Benito Juárez"),
    "MIA": ("mia_restaurants.csv",       "Miami International"),
    "MUC": ("muc_restaurants.csv",       "Munich Airport"),
    "ORD": ("ord_restaurants.csv",       "Chicago O'Hare"),
    "SEA": ("sea_restaurants.csv",       "Seattle-Tacoma International"),
    "YVR": ("yvr_restaurants.csv",       "Vancouver International"),
    "YYZ": ("yyz_restaurants.csv",       "Toronto Pearson"),
    "ZRH": ("zrh_restaurants.csv",       "Zurich Airport"),
}

OUTPUT_CSV = _os.path.join(HELPER_DIR, "independents.csv")

EXCLUDE_CHAINS = [
    "McDonald's", "KFC", "Church's Texas Chicken", "Burger King", "Hardee's",
    "Jack in the Box", "Arby's", "Shake Shack", "Habit Burger", "Dave's Hot Chicken",
    "Slim Chickens", "Buffalo Wild Wings", "Wingstop", "Bonchon", "Chicken Licken",
    "Chicken Republic", "Pizza Hut", "Papa John's", "Blaze Pizza", "Sbarro",
    "Villa Italian Kitchen", "PizzaExpress", "Rossopomodoro", "Sushi-Itto", "Starbucks",
    "illy", "Caffè Ritazza", "Joe and the Juice", "Peet's Coffee", "Dunkin'",
    "Tim Hortons", "Alfred Coffee", "Insomnia", "Espresso House", "Paul",
    "Le Pain Quotidien", "Amorino", "Segafredo", "Doutor Coffee", "Subway",
    "Jimmy John's", "Jersey Mike's", "Quiznos", "Potbelly", "Schlotzky's",
    "McAlister's Deli", "Earl of Sandwich", "Chipotle", "Taco Bell",
    "Moe's Southwest Grill", "On the Border", "Guzman y Gomez", "Panda Express",
    "Ippudo", "Marugame Udon", "Matsuya", "Nakau", "Auntie Anne's", "Cinnabon",
    "Jamba Juice", "Xing Fu Tang", "Tealive", "Kura Sushi", "Sushi Tei",
    "Crystal Jade", "Tim Ho Wan", "Paradise Dynasty", "PUTIEN", "Häagen-Dazs",
    "Ben & Jerry's", "Baskin-Robbins", "Cold Stone Creamery", "Carvel", "Dairy Queen",
    "Gelatissimo", "Swensen's", "Mister Donut", "Applebee's", "Denny's",
    "Outback Steakhouse", "Maggiano's", "Not Your Average Joe's", "Romano's Macaroni Grill",
    "Margaritaville", "Tony Roma's", "Pappadeaux", "Fuddruckers", "Davio's",
    "Magnolia Bakery", "Ladurée", "Godiva", "Max Brenner", "Nutella Café",
    "Pierre Hermé", "Venchi", "Boost Juice", "Freshens", "Juice Press", "raw JUCE",
    "Qwench Juice Bar", "Evergreens", "Protein Bar & Kitchen", "BrewDog", "Wetherspoons",
    "All Bar One", "Supermac's", "Fionn MacCool's", "Corcoran's", "Bar Louie",
    "Emporio Armani Caffè", "Fendi Caffè", "Louis Vuitton Café", "Lancôme Café",
    "Ralph's Coffee", "Café Kitsuné", "Nathan's Famous", "Feltman's of Coney Island",
    "Gold Coast Dogs", "Wrapchic", "Barburrito", "Tortilla", "Wok to Walk",
    "OldTown White Coffee", "Highlands Coffee", "FamilyMart", "Lawson",
    "Voodoo Doughnut", "Panera Bread", "Einstein Bros. Bagels", "Cosi", "La Madeleine",
    "Spur", "Mugg & Bean", "Steers", "Debonairs Pizza", "Ocean Basket",
    "Giraffe World Kitchen", "LEON", "Wafflemeister", "Yooji's", "Sushi Shop",
    "Umami Burger", "Cava", "Garbanzo", "Tocabe", "Simit Sarayı", "SO! Coffee",
    "Malatya Pazarı", "Nusr-Et", "Freshness Burger", "Hokkaido Baked Cheese Tart",
    "Santouka", "Tsuta", "Song Fa Bak Kut Teh", "Old Chang Kee", "Ya Kun",
    "Toast Box", "Breadtalk", "PastaMania", "LiHO", "Penang Culture", "Greendot",
    "Haldiram's", "Bikanervala", "Wow Momo", "Mad Over Donuts", "Kailash Parbat",
    "Third Wave Coffee", "Kyochon", "Hollys Coffee", "A Twosome Place", "coffeesmith",
    "Angels Pizza", "Tropical Hut", "Pancake House", "Jco", "Indomie Café",
    "Casa do Pão de Queijo", "Giraffas", "Bob's", "Havanna", "Que Bueno!", "Marché",
    "Confiserie Sprüngli", "Steiner Flughafenbeck", "Wiener Feinbäckerei",
    "Café-Konditorei Aida", "dean&david", "Hans im Glück", "Brezelkönig",
    "Heberer Bakery", "Relay", "Hudson",
]

# Normalised keys sorted longest-first so longer names match before shorter ones
# e.g. "starbucksreserve" matches "starbucksreserve" before "starbucks"
EXCLUDE_KEYS = sorted(
    {re.sub(r"[^a-z0-9]", "", c.lower()) for c in EXCLUDE_CHAINS},
    key=len,
    reverse=True,
)


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def is_chain(name: str) -> bool:
    """True if the restaurant name contains any chain key as a substring."""
    k = norm(name)
    return any(chain_key in k for chain_key in EXCLUDE_KEYS)


def main():
    # norm_key → list of (airport_code, airport_name, raw_name, cuisine)
    seen: dict[str, list[tuple]] = defaultdict(list)

    for code, (filename, airport_name) in AIRPORT_CSVS.items():
        path = os.path.join(CSV_DIR, filename)
        if not os.path.exists(path):
            print(f"  MISSING: {filename}")
            continue

        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                name = (row.get("name") or "").strip()
                if not name:
                    continue
                cuisine = (row.get("cuisine") or "").strip()
                seen[norm(name)].append((code, airport_name, name, cuisine))

    independents = [
        entries[0]
        for entries in seen.values()
        if len(set(e[0] for e in entries)) == 1   # only one airport
        and not is_chain(entries[0][2])            # not a known chain
    ]

    independents.sort(key=lambda r: (r[1], r[2].lower()))

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "cuisine", "airport_code", "airport_name"])
        writer.writeheader()
        for code, airport_name, name, cuisine in independents:
            writer.writerow({
                "name":         name,
                "cuisine":      cuisine,
                "airport_code": code,
                "airport_name": airport_name,
            })

    print(f"\n  {len(independents)} independent restaurants written to {OUTPUT_CSV}")
    print(f"\n  Breakdown by airport:")
    counts = Counter(r[0] for r in independents)
    for code, count in sorted(counts.items(), key=lambda x: -x[1]):
        airport_name = AIRPORT_CSVS[code][1]
        print(f"    {code}  {count:>4}  {airport_name}")


if __name__ == "__main__":
    main()