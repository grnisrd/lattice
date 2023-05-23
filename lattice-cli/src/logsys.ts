import ora, { Ora } from 'ora'

export interface ILogger {
  /**
   * End current reported task and create new one.
   * `reportStatus` defaults to `good`.
   */
  task: (name: string, finalStatus?: 'good' | 'bad') => void

  /**
   * Update current task text.
   */
  status: (text: string) => void

  /**
   * Add an information log.
   */
  info: (text: string) => void

  /**
   * Add a warning log.
   */
  warn: (text: string) => void

  /**
   * Add a (non-throwing) error log.
   */
  error: (text: string) => void
}

export class Logger implements ILogger {
  private _t = {
    init: false,
    name: '',
    infos: [] as string[],
    warns: [] as string[],
    errs: [] as string[],
  }

  private _statusOra: Ora | undefined
  private _statusTxt: string = ''
  private _status: string = ''

  task(name: string, finalStatus?: 'good' | 'bad') {
    // Stop spin.
    if (this._statusOra) {
      if (finalStatus === 'bad') {
        this._statusOra.fail(this._status)
      } else {
        this._statusOra.succeed(this._status)
      }
    }

    // Print errors and warnings first.
    if (this._t.init) {
      this._t.errs.forEach((t) => console.error(`[${this._t.name}] ${t}`))
      this._t.warns.forEach((t) => console.warn(`[${this._t.name}] ${t}`))
      this._t.infos.forEach((t) => console.info(`[${this._t.name}] ${t}`))
    }

    // Start spin with no status text.
    this._statusOra = ora(name).start()

    this._t = {
      init: true,
      name: name,
      infos: [],
      warns: [],
      errs: [],
    }
  }

  status(text: string) {
    let suffix = ''
    if (this._t.warns.length > 0 || this._t.errs.length > 0) {
      const wl = this._t.warns.length
      const el = this._t.errs.length
      suffix = `(${wl} warning${wl === 1 ? '' : 's'}${
        wl > 0 && el > 0 ? ', ' : ''
      }${el} error${el === 1 ? '' : 's'})`
    }

    this._statusTxt = text
    this._status = `${text}${suffix}`
    if (this._statusOra) {
      this._statusOra.text = this._status
    }
  }

  info(text: string) {
    this._t.infos.push(text)
  }

  warn(text: string) {
    this._t.warns.push(text)
    this.status(this._statusTxt)
  }

  error(text: string) {
    this._t.errs.push(text)
    this.status(this._statusTxt)
  }
}
