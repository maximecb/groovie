// Every link the encoding has ever been pinned to, in the order they were
// added.
//
// A link is the only thing a Groovie project is ever saved as, so a link that
// has been shared has to keep opening as the song it was made from for as long
// as the app is up. This list is what holds the encoding to that, and it only
// ever grows: nothing is edited or removed from it, because a link dropped
// here is a link nobody is checking any more.
//
// Two kinds of entry live here. One names a song in tests/corpus.js, which
// pins the link to a project written out by hand: the tests assert that the
// link still decodes to that exact song, which is what catches a decoder that
// has started reading an old link as a different one. The other names nothing,
// and is a link that was shared with somebody before it was written down here.
// There is no hand-written project to check those against, so they are held to
// a round trip instead: what they decode to has to survive being encoded and
// decoded again unchanged.
//
// When ENCODING_VERSION moves, the corpus is re-added at the new version and
// the old entries stay exactly where they are. Both the old and the new link
// for a song then have to decode to that same song, which is the whole point
// of stepping the version rather than breaking the links.
//
// tools/update_golden.js appends what the corpus currently encodes to. It
// never removes or rewrites an entry, so running it can only make this list
// longer. Links from other people are pasted in by hand, with `song: null`.
//
// Each link is left on one line however long it gets, since a link is one
// string and a broken-up one can't be pasted into a browser.

export const GOLDEN_LINKS = [
    { song: "the amen break", link:
        "untitled/BgBA_MEUQOLAXGGsElCXs4a1qAwaDUHg" },

    { song: "a drum and bass roller", link:
        "untitled/CGBA_UEUQOGFYCACdworVFVTqa7b-LPECCQoBEIEkhxrqBB24h1oAghrDTnpAA" },

    { song: "a 32 bar hip hop arrangement", link:
        "untitled/AyBEfMN60AQFuMBBHhcWk3S99MSlSh85wBB8CMFfKrX_-DFAr_llh86MPRd4XkQekfOmCGPSZTxjxL6kXiIoXE2sSSR98okA" },

    { song: "a 32 bar techno arrangement", link:
        "untitled/BaBEfEPRjhSJekfPuBJBHCkS4YkBfS1LHz74EaK_xff_fyR9O8gjxLxLigckkfkrBgI6SPqncA" },

    { song: "a 64 bar house arrangement", link:
        "untitled/BUBHPEOBjheJe-2LsfEJ6CdcXEzW5-Lli5HxAiBGCeJqatc-Jexcj4iKckk8BVDMtr8laJefkB8CfwBxO-AEGIijjlAD9Vf5pIfIEUQcCCCOF4l8UkfIYYERU_-E_q7_x38Hoq-qSfkBtQgV2nBCsABBk5GI_fUrAA" },

    { song: "patterns of prime lengths", link:
        "untitled/BQBEPENigOFQl77BAFuS_ZRcgwAbJH3TeCgATokfVLsMAcygvylUAA" },

    { song: "a default kit barely touched", link:
        "untitled/BQBCPKUB5BHhelSQ89KCH79wIII-kqB5SgP4IC_6qv_8AA" },

    { song: "a 32 bar house groove panned wide", link:
        "untitled/BUNDfUOBjgQQR4kZyAh8BDkCAHAQwIJT60SsfbvgRgn6RHH79-4ihH_Fj6AQQRwnEjMLyAh8BK0gQFgeYEEp-JUHmORQAWO5EBWNpBCWBCPFfqSA" },

    { song: "a 64 bar psytrance arrangement", link:
        "untitled/BpBFPUORjiAJ24YiRC0KQTUoto4IpEYRPQ3h79-_fv37kcQQCjI4gJM7iXol7KXIe_f48_79-_cekr0ZWA1GBFLinsp4-hIlAVIHVCAmCSgNAjECSUT0naFQgiiApjilh5DX0RV2IUgm4FJZxS3GrCxBDoQgzoHcSQid9TvA" },

    { song: "a dub techno arrangement", link:
        "untitled/BUAngZ5BwMcKBIZWBBBBjG-w8BZTKvPWY4uw8RKRwRJsDUWQQSxL2LkPGjHE5IlRPMxTwA" },

    { song: "a 32 bar two step arrangement", link:
        "untitled/BgYm4b5h6oBULcZCCCGzwqEkFCBbUXbfg0V72LHz1oAgLfAjBWphFFX4BBAJdrErLyEb5JJRJVAoDALWBAhI8kmkByZVVoprGnn4kSkBYcs0RqbW3gCLmkqSAA" },

    { song: "a 64 bar drill and bass arrangement", link:
        "untitled/B9ATI_5htYoCCAImhWOL9cICQhhNTEuGBTQszLjv36cmILUJCQERFJMkCIK1qWpZ-eQCgiBBCRRAjjXAiCRSCAVFZjaWhcFV2e_nsVIbBIiCQkxIJRQiixxLEl4iJICCKCBFyOSZT1ASSGk0JiFx1q0misRcCIgTmdSiU0mRsgG8UlIoZ5wGwIiBCCCgi0YBjCOtVLx8hn4rr77_NYTG6rBEgQESKApNnvpKr_LPLPE4j6kA8Ag2ASR0iZrn2IlYuQflAFNAC5AiCT0VQxEhEz9UsA" },

    { song: "a 60 bar rave with vocal one shots", link:
        "untitled/BiAm5b5Rjh0Ly4VCVrXLHJWPgC5EFITj2MkfERYiEYJbQAjdd3La2UOJWiUSPgFYdPyVvMD4B2MXkeSt5gDAiYmdjD9k_gGBDbWxx9SXh-AMCC2biJP6TaAYABI0cZJ8UPzASwHMAEwWNbZ1kgKoOvPlnAMm1z4FNAdNvf1KT5akgYEBItgYij7Ps-zpD4BkJU_KeA" },

    { song: "the longest song there can be", link:
        "untitled/BhBHPGMeQR7_9ES_7Rj7oOEJwh2IiiSKfrLiV47_DAC9FjlfKfV0FABCRQgx_qc6hARZpxGhFoHooMQ99sdIMA5IgpL3MZuy3MZuyJAPiKgkespf1IsARpAemf_do3w" },

    { song: "a hardcore stomp at the top of the range", link:
        "untitled/Dwy_4J5CGMbwWiSjbY1kEAMN1h5CIF-gSQRDe4sA" },

    { song: "a doom crawl at the bottom of the range", link:
        "untitled/AAAAAB5SgOCKIWI5I4GolWA" },

    { song: "a sixteen row percussion wall", link:
        "untitled/A8BBf-MeQR4XkBemSnP7TpWdL9FXot9F_0SPOSKPSBD0QedrW-kjHwiBFAes_EWvyRQ6y5JFE5qGox6w" },

    { song: "a phasing pulse of tiny patterns", link:
        "untitled/BcBMAAK5mb_sBANZXt_yBABsgq3zpkDAWZJ6vEv4FAD5CEnxKcCAAT0RFTiV0EgIvSQOjxKKDQHJIHNV_VIiAnJASIl-4UAI0gKSP_YKgPiQGgofrPwI5oAU1Z2OnLr9A5XY_ASmABTVn7dPBjWNgA" },

    { song: "the amen break", link:
        "untitled/FgBgfmCKIHFgLjDWCShL2cNa1AYNBqDw" },

    { song: "a drum and bass roller", link:
        "untitled/GGBgfqCKIHDCsBABO4UVqiqp1Ndt_FniBBIUAiECSQ411Ag7cQ60AQQ1hpz0gA" },

    { song: "a 32 bar hip hop arrangement", link:
        "untitled/EyBiPmG9aAIC3GAgjwuLSbpe-mJSpQ-c4Ag-BGCvlVr__BigV_yyw-dGHou8LyIPSPnTBDHpMp4x4l9SLxEULibWJJI--USA" },

    { song: "a 32 bar techno arrangement", link:
        "untitled/FaBiPiHoxwpEvSPn3AkgjhSJcMSAvpalj598CNFf4vv_v5I-neQR4l4lxQOSSPyVgwEdJH1TuA" },

    { song: "a 64 bar house arrangement", link:
        "untitled/FUBjniHAxwvEvfbF2PiE9BOuLiZrc_Fyxcj4gRAjBPE1NWufEvYuR8RFOSSeAqhmW1-StEvPyA-BP4A4nfACDERRxygB-qv80kPkCKIOBBBHC8S-KSPkMMCIqf_Cf1d_47-D0VfVJPyA2oQK7TghWAAgycjEfvqVgA" },

    { song: "patterns of prime lengths", link:
        "untitled/FQBiHiGxQHCoS99ggC3JfsouQYANkj7pvBQAJ0SPql2GAOZQX5SqAA" },

    { song: "a default kit barely touched", link:
        "untitled/FQBhHlKA8gjwvSpIeelBD9-4EEEfSVA8pQH8EBf9VX_-AA" },

    { song: "a 32 bar house groove panned wide", link:
        "untitled/FUNhvqHAxwIII8SM5AQ-AhyBADgIYEEp9aJWPt3wIwT9Ijj9-_cRQj_ix9AIII4TiRmF5AQ-AlaQICwPMCCU_EqDzHIoALHciArG0ghLAhHiv1JA" },

    { song: "a 64 bar psytrance arrangement", link:
        "untitled/FpBinqHIxxAE7cMRIhaFIJqUW0cEUiMInobw9-_fv379yOIIBRkcQEmdxL0S9lLkPfv8ef9-_fuPSV6MrAajAilxT2U8fQkSgKkDqhATBJQGgRiBJKJ6TtCoQRRAUxxSw8hr6Iq7EKQTcCks4pbjVhYgh0IQZ0DuJIRO-p3g" },

    { song: "a dub techno arrangement", link:
        "untitled/FUAnkM8g4GOFAkMrAgggxjfYeAsplXnrMcXYeIlI4Ik2BqLIIJYl7FyHjRjickSonmYp4A" },

    { song: "a 32 bar two step arrangement", link:
        "untitled/FgYm8N8w9UAqFuMhBBDZ4VCSChAtqLtvwaK97Fj560AQFvgRgrUwiir8AggEu1iVl5CN8kkokqgUBgFrAgQkeSTSA5Mqq0U1jTz8SJSAsOWaI1NrbwBFzSVJAA" },

    { song: "a 64 bar drill and bass arrangement", link:
        "untitled/F9ATMf8w2sUBBAETQrHF-uEBIQwmpiXDApoWZlx379OTEFqEhICIikmSBEFa1LUs_PIBQRAghIogRxrgRBIpBAKisxtLQuCq7Pfz2KkNgkRBISYkEooRRY4liS8REkBBFBAi5HJMp6gJJDSaExC461aTRWIuBEQJzOpRKaTI2QDeKSkUM84DYERAhBBQRaMAxhHWql4-Qz8V199_msJjdVgiQICJFAUmz30lV_lnlnicR9SAeAQbAJI6RM1z7ESsXIPygCmgBcgRBJ6KoYiQiZ-qWA" },

    { song: "a 60 bar rave with vocal one shots", link:
        "untitled/FiAm8t8oxw6F5cKhK1rljkrHwBciCkJx7GSPiIsRCMEtoARuu7ltbKHErRKJHwCsOn5K3mB8A7GLyPJW8wBgRMTOxh-yfwDAhtrY4-pLw_AGBBbNxEn9JtAMAAkaOMk-KH5gJYDmACYLGts6yQFUHXnyzgGTa58CmgOm3v6lJ8tSQMCAkWwMRR9n2fZ0h8AyEqflPA" },

    { song: "the longest song there can be", link:
        "untitled/FhBjnjGPII9_-iJf9ox90HCE4Q7ERRJFP1lxK8d_hgBeixyvlPq6CgAhIoQY_1OdQgIs04jQi0D0UGIe-2OkGAckQUl7mM3ZbmM3ZEgHxFQSPWUv6kWAI0gPTP_u0b4A" },

    { song: "a hardcore stomp at the top of the range", link:
        "untitled/Hwy_8E8hDGN4LRJRtsayCAGG6w8hEC_QJIIhvcWA" },

    { song: "a doom crawl at the bottom of the range", link:
        "untitled/EAAAEA8pQHBFELEckcDUSrA" },

    { song: "a sixteen row percussion wall", link:
        "untitled/E8Bgv_GPII8LyAvTJTn9p0rOl-ir0W-i_6JHnJFHpAh6IPO1rfSRj4RAigPWfiLX5IodZckiic1DUY9Y" },

    { song: "a phasing pulse of tiny patterns", link:
        "untitled/FcBmAAFczN_2AgGsr2_5AgA2QVb50yBgLMk9XiX8CgB8hCT4lOBAAJ6IipxK6CQEXpIHR4lFBoDkkDmq_qkRATkgJES_cKAEaQFJH_sFQHxIDQUP1n4Ec0AKas7HTl1-gcrsfgJTAApqz9ungxrGwA" },

    { song: "a filtered acid techno stretch", link:
        "untitled/FcAnSz0EeQcjHCkSHWgSQQazvoPIMSAjlEhbokCJMCekeIoGcXQ-IlpMsGk2RiYtdQPV48A" },
];
