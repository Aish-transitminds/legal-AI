"""State-wise stamp duty and registration rules for Indian states."""

STATE_COMPLIANCE: dict[str, dict] = {
    "maharashtra": {
        "name": "Maharashtra",
        "stamp_duty_lease": "0.25% of total rent for lease up to 5 years; 1% for 5-10 years; 2% for 10-30 years",
        "stamp_duty_sale": "5% for male, 4% for female (in municipal areas); 4%/3% in rural",
        "registration_fee": "1% of property value or Rs 30,000 max",
        "registration_required": "Leases > 11 months must be registered",
        "rent_control": "Maharashtra Rent Control Act, 1999 applies to premises built before 2000",
        "key_acts": [
            "Maharashtra Rent Control Act 1999",
            "Indian Stamp Act 1899",
            "Registration Act 1908",
        ],
    },
    "karnataka": {
        "name": "Karnataka",
        "stamp_duty_lease": "1% of average annual rent for lease up to 10 years; 2% for 10-20 years; 3% for 20+ years",
        "stamp_duty_sale": "5% for properties above Rs 45 lakh; 3% for Rs 21-45 lakh; 2% for up to Rs 20 lakh",
        "registration_fee": "1% of property value",
        "registration_required": "All leases exceeding 11 months must be registered",
        "rent_control": "Karnataka Rent Act, 1999 (replaced 2001 Act in certain areas)",
        "key_acts": [
            "Karnataka Rent Act 1999",
            "Karnataka Stamp Act 1957",
            "Registration Act 1908",
        ],
    },
    "delhi": {
        "name": "Delhi (NCT)",
        "stamp_duty_lease": "Average annual rent calculation: 2% for leases up to 5 years; 3% for 5-10 years; 6% for 10+ years",
        "stamp_duty_sale": "4% for male; 4% for female (women get 1% rebate on properties up to Rs 10 crore)",
        "registration_fee": "1% of consideration value",
        "registration_required": "Mandatory for leases exceeding 11 months under Registration Act 1908",
        "rent_control": "Delhi Rent Control Act, 1958 (applies to premises rented before 1988)",
        "key_acts": [
            "Delhi Rent Control Act 1958",
            "Indian Stamp Act 1899",
            "Registration Act 1908",
        ],
    },
    "tamil_nadu": {
        "name": "Tamil Nadu",
        "stamp_duty_lease": "1% of annual rent or advance rent for lease up to 10 years; 2% for 10-20 years; 3% above 20 years",
        "stamp_duty_sale": "7% of market value or consideration value (whichever is higher)",
        "registration_fee": "1% (4% total with stamp duty for residential up to Rs 1 crore)",
        "registration_required": "All leases above 11 months require registration",
        "rent_control": "Tamil Nadu Buildings (Lease and Rent Control) Act, 1960",
        "key_acts": [
            "TN Buildings Act 1960",
            "Indian Stamp Act 1899",
            "Registration Act 1908",
        ],
    },
    "uttar_pradesh": {
        "name": "Uttar Pradesh",
        "stamp_duty_lease": "2% of annual rent for lease up to 5 years; 3% for 5-10 years; 5% for 10+ years",
        "stamp_duty_sale": "7% for male; 6% for female (in urban areas)",
        "registration_fee": "1% of consideration",
        "registration_required": "Leases exceeding 11 months must be registered",
        "rent_control": "UP Urban Buildings (Regulation of Letting, Rent and Eviction) Act, 1972",
        "key_acts": [
            "UP Rent Act 1972",
            "Indian Stamp Act 1899",
            "Registration Act 1908",
        ],
    },
    "telangana": {
        "name": "Telangana",
        "stamp_duty_lease": "0.5% of total rent for lease up to 5 years; 1% for 5-10 years",
        "stamp_duty_sale": "4% of market value",
        "registration_fee": "0.5% (max Rs 20,000 for residential)",
        "registration_required": "Mandatory for leases exceeding 11 months",
        "rent_control": "Telangana Buildings (Lease, Rent and Eviction) Control Act, 1960",
        "key_acts": [
            "Telangana Rent Act 1960",
            "Indian Stamp Act 1899",
            "Registration Act 1908",
        ],
    },
    "gujarat": {
        "name": "Gujarat",
        "stamp_duty_lease": "1% of annual rent for up to 5 years; 2% for 5-10 years; 3% for 10-30 years",
        "stamp_duty_sale": "4.9% of market value",
        "registration_fee": "1% of consideration",
        "registration_required": "Leases above 11 months must be registered",
        "rent_control": "Bombay Rents, Hotel and Lodging House Rates Control Act, 1947 (as applicable to Gujarat)",
        "key_acts": [
            "Bombay Rent Act 1947",
            "Gujarat Stamp Act",
            "Registration Act 1908",
        ],
    },
    "west_bengal": {
        "name": "West Bengal",
        "stamp_duty_lease": "0.5% of annual rent or advance for up to 5 years; 1% for 5-10 years",
        "stamp_duty_sale": "5% for properties up to Rs 25 lakh; 6% for Rs 25-40 lakh; 7% above Rs 40 lakh",
        "registration_fee": "1% of market value",
        "registration_required": "All leases exceeding 11 months require registration",
        "rent_control": "West Bengal Premises Tenancy Act, 1997",
        "key_acts": [
            "WB Premises Tenancy Act 1997",
            "Indian Stamp Act 1899",
            "Registration Act 1908",
        ],
    },
}


def get_supported_states() -> list[dict[str, str]]:
    return [
        {"code": code, "name": data["name"]} for code, data in STATE_COMPLIANCE.items()
    ]


def get_state_compliance(state_code: str, doc_type: str = "general") -> dict | None:
    state = STATE_COMPLIANCE.get(state_code.lower())
    if not state:
        return None

    result = {
        "state": state["name"],
        "registration_required": state["registration_required"],
        "key_acts": state["key_acts"],
    }

    if doc_type == "lease":
        result["stamp_duty"] = state["stamp_duty_lease"]
        result["rent_control"] = state["rent_control"]
    elif doc_type == "sale_deed":
        result["stamp_duty"] = state["stamp_duty_sale"]
    else:
        result["stamp_duty_lease"] = state["stamp_duty_lease"]
        result["stamp_duty_sale"] = state["stamp_duty_sale"]

    result["registration_fee"] = state["registration_fee"]
    return result
