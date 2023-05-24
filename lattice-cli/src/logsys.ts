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
  state = {
    init: false,
    name: '',
    infos: [] as string[],
    warns: [] as string[],
    errs: [] as string[],
  }
  states: this['state'][] = []

  private _silent: boolean
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
    if (this.state.init && !this._trueSilence) {
      this.state.errs.forEach((t) => console.error(t))
      this.state.warns.forEach((t) => console.warn(t))
      if (!this._silent) {
        this.state.infos.forEach((t) => console.info(t))
      }
    }

    this.states.push(this.state)

    // Start spin with no status text.
    if (!this._silent) {
      this._statusOra = ora(name).start()
    }

    this.state = {
      init: true,
      name: name,
      infos: [],
      warns: [],
      errs: [],
    }

    this.status(name)
  }

  status(text: string) {
    let suffix = ''
    if (this.state.warns.length > 0 || this.state.errs.length > 0) {
      const wl = this.state.warns.length
      const el = this.state.errs.length
      suffix = `(${wl} warning${wl === 1 ? '' : 's'}, ${el} error${
        el === 1 ? '' : 's'
      })`
    }

    this._statusTxt = text
    this._status = `${text} ${suffix}`
    if (this._statusOra) {
      this._statusOra.text = this._status
    }
  }

  info(text: string) {
    this.state.infos.push(text)
  }

  warn(text: string) {
    this.state.warns.push(text)
    this.status(this._statusTxt)
  }

  error(text: string) {
    this.state.errs.push(text)
    this.status(this._statusTxt)
  }

  unstatus(good?: boolean) {
    good ? this._statusOra?.succeed() : this._statusOra?.fail()
    if (this.state.init && !this._trueSilence) {
      this.state.errs.forEach((t) => console.error(t))
      this.state.warns.forEach((t) => console.warn(t))
      if (!this._silent) {
        this.state.infos.forEach((t) => console.info(t))
      }
    }
    this.states.push(this.state)
  }

  /**
   *
   * @param silent If true, infos are silenced (but not warnings/errors).
   */
  constructor(silent?: boolean, private _trueSilence?: boolean) {
    this._silent = silent ?? false
  }
}
