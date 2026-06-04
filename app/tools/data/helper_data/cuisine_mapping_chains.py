#!/usr/bin/env python3
"""
Cuisine mapping for chain_restaurants.json → broad categories.
Same target categories as cuisine_mapping.py for independents.
"""

CUISINE_MAPPING = {

    # ── Café ─────────────────────────────────────────────────────────────────
    "Specialty Coffee":             ["Café"],
    "Coffee & Café":                ["Café"],
    "Italian Coffee":               ["Café", "Italian"],
    "Italian Café":                 ["Café", "Italian"],
    "French Café":                  ["Café", "French", "European"],
    "Korean Café":                  ["Café", "Korean"],
    "Korean Coffee & Café":         ["Café", "Korean"],
    "Filipino Coffee":              ["Café", "Filipino", "Asian"],
    "Colombian Coffee":             ["Café", "Latin American"],
    "Cuban Café":                   ["Café", "Latin American"],
    "Austrian Coffeehouse":         ["Café", "German", "European"],
    "Spanish Café":                 ["Café", "Spanish", "European"],
    "Singaporean Café":             ["Café", "Singaporean", "Asian", "Pan-Asian"],
    "Malaysian Café":               ["Café", "Malaysian", "Asian", "Pan-Asian"],
    "Malaysian Coffee":             ["Café", "Malaysian", "Asian", "Pan-Asian"],
    "Australian Café":              ["Café"],
    "British Café & Deli":          ["Café", "Sandwiches & Deli"],
    "Dutch Café / Market":          ["Café", "European", "Grab & Go"],
    "French Café & Bakery":         ["Café", "Bakery", "French", "European"],
    "Italian Coffee & Café":        ["Café", "Italian"],
    "Italian / Café":               ["Café", "Italian"],
    "Coffee Shop & Casual Dining":  ["Café"],
    "Coffee Bar":                   ["Café"],
    "Coffee":                       ["Café"],
    "Coffee & Tea":                 ["Café"],
    "Coffee & Donuts":              ["Café", "Bakery"],
    "Juice & Coffee":               ["Café", "Healthy"],
    "Chocolate Café":               ["Café", "Desserts"],
    "Chocolate & Café":             ["Café", "Desserts"],
    "Irish Chocolate & Café":       ["Café", "Desserts"],
    "Dessert Café":                 ["Café", "Desserts"],
    "Travel Retail & Café":         ["Café", "Grab & Go"],
    "Travel Retail / Café":         ["Café", "Grab & Go"],
    "Café / Grab & Go":             ["Café", "Grab & Go"],
    "Café / Healthy":               ["Café", "Healthy"],
    "Market & Café":                ["Café", "Grab & Go"],
    "Market & Italian Café":        ["Café", "Italian", "Grab & Go"],
    "German / Austrian Bakery":     ["Bakery", "German", "European"],

    # ── Bakery ───────────────────────────────────────────────────────────────
    "Bakery":                       ["Bakery"],
    "Bakery & Café":                ["Bakery", "Café"],
    "Bakery & Desserts":            ["Bakery", "Desserts"],
    "Bakery / Pizza":               ["Bakery", "Pizza"],
    "Bakery / Cupcakes":            ["Bakery", "Desserts"],
    "Bakery Café":                  ["Bakery", "Café"],
    "French Bakery":                ["Bakery", "French", "European"],
    "French Bakery & Café":         ["Bakery", "Café", "French", "European"],
    "French Patisserie":            ["Bakery", "French", "European"],
    "French Luxury Café":           ["Bakery", "Café", "French", "European"],
    "German Bakery":                ["Bakery", "German", "European"],
    "British Bakery":               ["Bakery"],
    "Mexican Bakery":               ["Bakery", "Latin American", "Mexican"],
    "Turkish Bakery":               ["Bakery", "Middle Eastern"],
    "Belgian Bakery & Café":        ["Bakery", "Café", "European"],
    "Korean Bakery":                ["Bakery", "Korean"],
    "Korean Bakery & Café":         ["Bakery", "Café", "Korean"],
    "Pretzels & Bakery":            ["Bakery"],
    "Donuts & Coffee":              ["Bakery", "Café"],
    "Donuts":                       ["Bakery", "Desserts"],
    "Swiss Confectionery":          ["Bakery", "German", "European"],
    "Candy Store":                  ["Bakery", "Desserts"],
    "Chocolate & Candy":            ["Bakery", "Desserts"],
    "Gourmet Popcorn":              ["Grab & Go"],
    "Gourmet Nuts & Popcorn":       ["Grab & Go"],
    "Argentine Café & Confectionery": ["Bakery", "Café", "Latin American"],
    "Italian Chocolate & Gelato":   ["Bakery", "Italian", "Desserts"],
    "Waffles & Desserts":           ["Bakery", "Desserts"],
    "Asian Buns":                   ["Bakery", "Asian"],
    "Malaysian Buns":               ["Bakery", "Malaysian", "Asian", "Pan-Asian"],
    "Bagels":                       ["Sandwiches & Deli"],
    "Bagels & Café":                ["Sandwiches & Deli", "Café"],

    # ── Bar ──────────────────────────────────────────────────────────────────
    "Bar":                          ["Bar"],
    "Bar / Pub":                    ["Bar"],
    "Bar & Restaurant":             ["Bar"],
    "Bar / Restaurant":             ["Bar"],
    "Bar / Craft Cocktails":        ["Bar"],
    "Bar / Craft Beer":             ["Bar"],
    "Bar / Cocktails":              ["Bar"],
    "Bar / French":                 ["Bar", "French", "European"],
    "Bar / Italian":                ["Bar", "Italian"],
    "Beer Bar":                     ["Bar"],
    "Craft Beer Bar":               ["Bar"],
    "Craft Beer":                   ["Bar"],
    "Wine Bar":                     ["Bar"],
    "Irish Pub":                    ["Bar"],
    "British Pub":                  ["Bar"],
    "Wings & Sports Bar":           ["Bar", "Fast Food"],
    "BBQ":                          ["Steak, Grill Chicken & BBQ"],
    "American Gastrobar":           ["Bar", "American"],

    # ── Grab & Go ─────────────────────────────────────────────────────────────
    "Convenience Store":            ["Grab & Go"],
    "Mexican Convenience Store":    ["Grab & Go", "Latin American", "Mexican"],
    "Travel Retail":                ["Grab & Go"],
    "Vending":                      ["Grab & Go"],
    "Healthy Vending":              ["Grab & Go", "Healthy"],
    "Food Hall":                    ["Grab & Go"],
    "Snacks":                       ["Grab & Go"],
    "International Market-Style":   ["Grab & Go", "International"],
    "Brazilian Snacks":             ["Grab & Go", "Latin American"],
    "Singaporean Snacks":           ["Grab & Go", "Singaporean", "Asian", "Pan-Asian"],

    # ── American ─────────────────────────────────────────────────────────────
    "American Casual Dining":       ["American"],
    "American Diner":               ["American"],
    "American Comfort Food":        ["American"],
    "American Breakfast":           ["American"],
    "American / Music Themed":      ["American"],
    "American / International":     ["American", "International"],
    "American / Caribbean":         ["American", "Latin American"],
    "American Chinese":             ["American", "Chinese", "Asian"],
    "Ribs & American":              ["American", "Steak, Grill Chicken & BBQ"],
    "Chicago Pizza":                ["American", "Pizza"],
    "Casual Dining":                ["American"],
    "World Kitchen":                ["American", "International"],

    # ── Burgers ───────────────────────────────────────────────────────────────
    "Burgers":                      ["Burgers"],
    "Gourmet Burgers":              ["Burgers"],
    "Burgers / Fast Food":          ["Burgers", "Fast Food"],
    "Healthy Burgers":              ["Burgers", "Healthy"],
    "Japanese Burgers":             ["Burgers", "Japanese", "Asian"],

    # ── Fast Food ─────────────────────────────────────────────────────────────
    "Fast Food":                    ["Fast Food"],
    "Fast Food / Root Beer":        ["Fast Food"],
    "Fast Food / Gourmet":          ["Fast Food"],
    "Fried Chicken":                ["Fast Food", "Steak, Grill Chicken & BBQ"],
    "Chicken Fast Food":            ["Fast Food", "Steak, Grill Chicken & BBQ"],
    "Chicken Wings":                ["Fast Food", "Steak, Grill Chicken & BBQ"],
    "Chicken":                      ["Fast Food", "Steak, Grill Chicken & BBQ"],
    "Nashville Hot Chicken":        ["Fast Food", "Steak, Grill Chicken & BBQ"],
    "Hot Dogs":                     ["Fast Food", "American"],
    "Healthy Fast Food":            ["Fast Food", "Healthy"],
    "Healthy Fast Casual":          ["Healthy", "Fast Food"],
    "Healthy Casual Dining":        ["Healthy"],
    "Asian Street Food":            ["Fast Food", "Asian"],
    "International Street Food":    ["Fast Food", "International"],
    "Wraps & Fast Casual":          ["Fast Food", "Sandwiches & Deli"],

    # ── Pizza ─────────────────────────────────────────────────────────────────
    "Pizza":                        ["Pizza"],
    "Italian / Pizza":              ["Pizza", "Italian"],
    "Italian Pizza":                ["Pizza", "Italian"],
    "Neapolitan Pizza":             ["Pizza", "Italian"],
    "Pizza Delivery":               ["Pizza"],

    # ── Italian ───────────────────────────────────────────────────────────────
    "Italian":                      ["Italian"],
    "Italian American":             ["Italian", "American"],
    "Italian / Pasta":              ["Italian"],
    "Italian / Bar":                ["Italian", "Bar"],
    "Italian Market & Restaurant":  ["Italian", "Grab & Go"],
    "Italian Steakhouse":           ["Italian", "Steak, Grill Chicken & BBQ"],

    # ── French ────────────────────────────────────────────────────────────────
    "French Fine Dining":           ["French", "European"],
    "French Brasserie":             ["French", "European"],

    # ── Spanish ───────────────────────────────────────────────────────────────
    "Spanish / Iberian":            ["Spanish", "European"],
    "Spanish Tapas":                ["Spanish", "European"],

    # ── German ───────────────────────────────────────────────────────────────
    "German / Snacks":              ["German", "European", "Grab & Go"],

    # ── Mediterranean ────────────────────────────────────────────────────────
    "Mediterranean":                ["Mediterranean"],
    "Mediterranean / Middle Eastern": ["Mediterranean", "Middle Eastern"],

    # ── Middle Eastern ────────────────────────────────────────────────────────
    "Middle Eastern":               ["Middle Eastern"],
    "Lebanese":                     ["Middle Eastern"],
    "Turkish Dried Fruits & Nuts":  ["Middle Eastern", "Grab & Go"],

    # ── Indian & South Asian ─────────────────────────────────────────────────
    "Indian":                       ["Indian & South Asian"],
    "South Indian":                 ["Indian & South Asian"],
    "South Indian / Asian":         ["Indian & South Asian", "Asian"],
    "Indian Street Food":           ["Indian & South Asian", "Fast Food"],
    "Indian Vegetarian":            ["Indian & South Asian", "Healthy"],
    "Indian Sweets & Snacks":       ["Indian & South Asian", "Grab & Go"],
    "Indian Snacks & Sweets":       ["Indian & South Asian", "Grab & Go"],
    "Indian Tea & Snacks":          ["Indian & South Asian", "Café"],
    "Indian Chai & Snacks":         ["Indian & South Asian", "Café"],
    "Indian Desserts & Patisserie": ["Indian & South Asian", "Bakery", "Desserts"],
    "Indian / Curry":               ["Indian & South Asian"],
    "Indian / Gujarati":            ["Indian & South Asian"],
    "Indian / Momos":               ["Indian & South Asian"],
    "Indian-Mexican Fusion":        ["Indian & South Asian", "Latin American", "Mexican"],

    # ── Chinese ───────────────────────────────────────────────────────────────
    "Chinese":                      ["Chinese", "Asian"],
    "Chinese Noodles":              ["Chinese", "Asian"],
    "Chinese Fast Food":            ["Chinese", "Asian", "Fast Food"],
    "Chinese Tea":                  ["Chinese", "Asian", "Café"],
    "Chinese / Seafood":            ["Chinese", "Asian", "Seafood"],
    "Chinese / Dumplings":          ["Chinese", "Asian"],
    "Chinese / Shanghai":           ["Chinese", "Asian"],
    "Chinese / Hong Kong":          ["Chinese", "Asian"],
    "Chinese / Singaporean":        ["Chinese", "Asian", "Singaporean", "Pan-Asian"],
    "Dim Sum":                      ["Chinese", "Asian"],
    "Fujian Chinese":               ["Chinese", "Asian"],

    # ── Japanese ─────────────────────────────────────────────────────────────
    "Japanese":                     ["Japanese", "Asian"],
    "Japanese / Sushi":             ["Japanese", "Asian"],
    "Japanese / Conveyor Belt Sushi": ["Japanese", "Asian"],
    "Japanese Ramen":               ["Japanese", "Asian"],
    "Japanese Gyudon":              ["Japanese", "Asian"],
    "Japanese Tonkatsu":            ["Japanese", "Asian"],
    "Japanese Udon":                ["Japanese", "Asian"],
    "Japanese Noodles":             ["Japanese", "Asian"],
    "Japanese Fast Food":           ["Japanese", "Asian", "Fast Food"],
    "Bone Broth / Soups":           ["Japanese", "Asian"],

    # ── Korean ────────────────────────────────────────────────────────────────
    "Korean":                       ["Korean", "Asian"],
    "Korean Fried Chicken":         ["Korean", "Asian", "Steak, Grill Chicken & BBQ"],
    "Korean Pork Cutlet":           ["Korean", "Asian"],
    "Korean / Pork Cutlet":         ["Korean", "Asian"],
    "Korean Street Food":           ["Korean", "Asian", "Fast Food"],
    "Korean Noodles":               ["Korean", "Asian"],

    # ── Thai ─────────────────────────────────────────────────────────────────
    "Thai":                         ["Thai", "Asian", "Pan-Asian"],

    # ── Vietnamese ────────────────────────────────────────────────────────────
    "Vietnamese":                   ["Vietnamese", "Asian", "Pan-Asian"],
    "Vietnamese Noodles":           ["Vietnamese", "Asian", "Pan-Asian"],
    "Indonesian Noodles":           ["Asian", "Pan-Asian"],

    # ── Malaysian ────────────────────────────────────────────────────────────
    "Malaysian":                    ["Malaysian", "Asian", "Pan-Asian"],
    "Malaysian / Penang":           ["Malaysian", "Asian", "Pan-Asian"],
    "Singaporean / Malaysian":      ["Singaporean", "Malaysian", "Asian", "Pan-Asian"],
    "Australian Deli & Café":       ["Sandwiches & Deli", "Café"],

    # ── Singaporean ──────────────────────────────────────────────────────────
    "Singaporean / Chinese":        ["Singaporean", "Chinese", "Asian", "Pan-Asian"],

    # ── Taiwanese ────────────────────────────────────────────────────────────
    "Taiwanese Tea":                ["Taiwanese", "Asian", "Café"],
    "Taiwanese / Dim Sum":          ["Taiwanese", "Chinese", "Asian"],

    # ── Filipino ─────────────────────────────────────────────────────────────
    "Filipino Fast Food":           ["Filipino", "Asian", "Fast Food"],
    "Filipino Breakfast & American": ["Filipino", "Asian", "American"],
    "Filipino Flavoured Fries":     ["Filipino", "Asian", "Fast Food"],

    # ── Asian (general) ───────────────────────────────────────────────────────
    "Asian Fusion":                 ["Asian"],
    "Asian Noodles":                ["Asian"],
    "Asian Stir-Fry":               ["Asian"],
    "Vegetarian / Asian":           ["Asian", "Healthy"],
    "Noodles":                      ["Asian"],
    "Bubble Tea":                   ["Asian", "Café"],

    # ── Mexican / Latin American ─────────────────────────────────────────────
    "Mexican":                      ["Mexican", "Latin American"],
    "Tex-Mex":                      ["Mexican", "Latin American", "American"],
    "Mexican Fast Food":            ["Mexican", "Latin American", "Fast Food"],
    "Latin American":               ["Latin American"],
    "Latin American / Empanadas":   ["Latin American"],
    "Brazilian Fast Casual":        ["Latin American", "Fast Food"],
    "Portuguese Chicken":           ["Steak, Grill Chicken & BBQ"],

    # ── Steak, Grill Chicken & BBQ ────────────────────────────────────────────
    "Steakhouse":                   ["Steak, Grill Chicken & BBQ"],

    # ── Seafood ───────────────────────────────────────────────────────────────
    "Seafood":                      ["Seafood"],
    "Cajun Seafood":                ["Seafood", "American"],

    # ── Sandwiches & Deli ────────────────────────────────────────────────────
    "Sandwiches":                   ["Sandwiches & Deli"],
    "Sandwiches & Café":            ["Sandwiches & Deli", "Café"],
    "Deli":                         ["Sandwiches & Deli"],
    "Deli & Coffee":                ["Sandwiches & Deli", "Café"],
    "Grilled Cheese & Sandwiches":  ["Sandwiches & Deli"],
    "Irish Sandwiches":             ["Sandwiches & Deli"],
    "British Sandwiches":           ["Sandwiches & Deli"],
    "Belgian Sandwiches":           ["Sandwiches & Deli", "European"],

    # ── Healthy ───────────────────────────────────────────────────────────────
    "Healthy Fast Casual":          ["Healthy", "Fast Food"],
    "Juice & Smoothies":            ["Healthy"],
    "Cold-Pressed Juice":           ["Healthy"],
    "Smoothies & Yogurt":           ["Healthy", "Desserts"],
    "Smoothies & Juice":            ["Healthy", "Desserts"],
    "Smoothies":                    ["Healthy", "Desserts"],
    "Healthy Smoothies":            ["Healthy", "Desserts"],
    "Healthy / Snacks":             ["Healthy", "Grab & Go"],
    "Healthy / Plant-Based":        ["Healthy"],
    "Healthy / Natural":            ["Healthy"],

    # ── Desserts ──────────────────────────────────────────────────────────────
    "Ice Cream":                    ["Desserts"],
    "Ice Cream & Fast Food":        ["Desserts", "Fast Food"],
    "Ice Cream & Casual Dining":    ["Desserts"],
    "Gelato":                       ["Desserts", "Italian"],
    "Frozen Yogurt":                ["Desserts", "Healthy"],

    # ── International ─────────────────────────────────────────────────────────
    "Media / Pop-Up Food":          ["International"],

    # ── Canadian ─────────────────────────────────────────────────────────────
    "Native American":              ["Canadian"],
}

# ── Genuinely new categories needed ──────────────────────────────────────────
# None. Every entry above maps to existing categories.
# The closest calls were:
#   "American Artisan Cheese" → Grab & Go (it's a retail/deli concept)
#   "Bone Broth / Soups"      → Japanese (Ippudo-style)
#   "Media / Pop-Up Food"     → International
# All fit without creating new buckets.

CUISINE_MAPPING["American Artisan Cheese"] = ["Sandwiches & Deli", "American"]