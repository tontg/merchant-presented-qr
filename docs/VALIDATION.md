# Validation Scope

Reference: EMV QR Code Specification for Payment Systems (EMV QRCPS),
Merchant-Presented Mode, v1.1, November 2020. Obtain specifications and later
bulletins from [EMVCo](https://www.emvco.com/emv-technologies/qr-codes/).
The copyrighted PDFs are not redistributed. Consumer-Presented Mode is not
supported. This project is not an EMVCo certification or payment authorization
service; a passing result does not authenticate a merchant.

| Rule | Implemented |
| --- | --- |
| Numeric two-character IDs/lengths, complete values | Yes, at every defined template level |
| Duplicate IDs within the same container | Yes, including nested templates |
| Root template context | 26-51, 62, 64, 80-99; 62-50 through 62-99 are payment-system templates |
| Scheme-defined primitive/context-specific values | Preserved as opaque strings; never guessed to be TLV |
| Required root fields and merchant-account information | Yes |
| 00 first, value 01; initiation 11/12 if present | Yes |
| MCC/currency/country syntax | Yes; lookup descriptions are not membership validation |
| Amount/fee syntax, lengths and fee dependencies | Basic checks; currency-specific decimal precision is not enforced |
| Merchant name/city/postal-code lengths | Yes |
| Required GUI and language-template children | Yes, in known templates |
| Final CRC 63/04 and UTF-8 CRC-16/CCITT-FALSE | Yes |
| Empty values | Warnings; other mandatory-field rules may also produce errors |
| Unicode | Accepted; lengths count code points, bytes/CRC use UTF-8 |
| Scheme-specific fields, identifiers and business rules | Not built in; use explicit extension rules |
| All reserved values, conditional rules and subsequent EMV bulletins | Not exhaustively implemented |

`valid` means no errors under these implemented checks and the supplied
extension rules. It must not be advertised as exhaustive EMV or scheme
compliance. Add a specification reference and regression fixture when extending
the table. Test fixtures must use synthetic, non-sensitive merchant data.
